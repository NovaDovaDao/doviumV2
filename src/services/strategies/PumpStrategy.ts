import { PublicKey } from '@solana/web3.js';
import {
  RSI, MACD, StochasticOscillator, VolumeProfile, 
  Volatility, MarketDepth, PriceData, IndicatorConfig
} from '../indicators/index';
import { Logger } from '../../utils/logger';
import { PumpFunSDK } from '../pumpfun/pumpfun';
import { SwapService } from '../trading/swapService';
import { OrderService } from '../trading/orderService';
import { TradingSimulator } from '../simulation/tradingSimulator';

interface StrategyIndicators {
  rsi: RSI;
  macd: MACD;
  stochastic: StochasticOscillator;
  volumeProfile: VolumeProfile;
  volatility: Volatility;
  marketDepth: MarketDepth;
}

interface TradingConfig {
  minSolBalance: number;
  maxPositionSize: number;
  rsiOversold: number;
  rsiOverbought: number;
  profitTarget: number;
  stopLoss: number;
  macdThreshold: number;
  volumeThreshold: number;
  depthRatioThreshold: number;
}

interface Position {
  entryPrice: number;
  amount: number;
  entryTimestamp: number;
}

interface TradeMetrics {
  mint: string;
  price: number;
  volume: number;
  timestamp: number;
}

export class PumpStrategy {
  private logger = new Logger();
  private indicators: StrategyIndicators;
  private positions: Map<string, Position> = new Map();
  private metrics: Map<string, TradeMetrics> = new Map();
  private priceHistory: Map<string, PriceData[]> = new Map();
  private lastTradeTime: Map<string, number> = new Map();

  private config: TradingConfig;

  private simulator: TradingSimulator;

  constructor(
    private pumpFunSDK: PumpFunSDK,
    private swapService: SwapService,
    private orderService: OrderService,
    private wallet: PublicKey,
    config?: Partial<TradingConfig>
  ) {
    this.config = {
      minSolBalance: 0.1,
      maxPositionSize: 1.0,
      rsiOversold: 30,
      rsiOverbought: 70,
      profitTarget: 0.15,
      stopLoss: 0.05,
      macdThreshold: 0,
      volumeThreshold: 1,
      depthRatioThreshold: 1.2,
      ...config
    };
    this.indicators = {
      rsi: new RSI(config),
      macd: new MACD(config),
      stochastic: new StochasticOscillator(config),
      volumeProfile: new VolumeProfile(),
      volatility: new Volatility(config),
      marketDepth: new MarketDepth()
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.reportBalance();
      this.startBalanceMonitoring();
      this.logger.info("PumpStrategy initialized");
    } catch (error) {
      this.logger.error("Initialization error:", error);
      throw error;
    }
  }

  private startBalanceMonitoring(): void {
    setInterval(() => this.reportBalance(), 30000);
  }

  private async reportBalance(): Promise<void> {
    const balance = await this.tradingWallet.getSolBalance();
    this.logger.info(`Current balance: ${balance?.toString() || 0} SOL`);
  }

  public async evaluateEntry(token: string, priceData: PriceData[]): Promise<boolean> {
    if (!this.isValidForTrading(token, priceData)) return false;

    const analysis = this.analyzeMarket(priceData);
    return this.checkEntryConditions(analysis);
  }

  private isValidForTrading(token: string, priceData: PriceData[]): boolean {
    if (priceData.length < 30) return false;
    
    const metrics = this.metrics.get(token);
    if (!metrics) return false; // Early return if no metrics
    
    const lastTrade = this.lastTradeTime.get(token) || 0;
    const timeSinceLastTrade = Date.now() - lastTrade;
  
    return metrics.volumeSOL >= this.MIN_VOLUME 
      && timeSinceLastTrade > 60000
      && !this.positions.has(token);
  }

  private analyzeMarket(priceData: PriceData[]) {
    return {
      rsi: this.indicators.rsi.calculate(priceData),
      macd: this.indicators.macd.calculate(priceData),
      stoch: this.indicators.stochastic.calculate(priceData),
      volume: this.indicators.volumeProfile.calculate(priceData),
      volatility: this.indicators.volatility.calculate(priceData),
      depth: this.indicators.marketDepth.calculate(priceData)
    };
  }

  private checkEntryConditions(analysis: ReturnType<typeof this.analyzeMarket>): boolean {
    return analysis.rsi.value < this.MIN_RSI_ENTRY 
      && analysis.macd.histogram > 0
      && analysis.stoch.k < 20
      && analysis.volume.buyPressure > analysis.volume.sellPressure
      && !analysis.volatility.isHigh
      && analysis.depth.ratio > 1.2;
  }

  public async evaluateExit(token: string, priceData: PriceData[]): Promise<boolean> {
    const position = this.positions.get(token);
    if (!position) return false;

    const analysis = this.analyzeMarket(priceData);
    return this.checkExitConditions(position, analysis, priceData[priceData.length - 1].price);
  }

  private checkExitConditions(
    position: Position, 
    analysis: ReturnType<typeof this.analyzeMarket>,
    currentPrice: number
  ): boolean {
    const profitLoss = (currentPrice - position.entryPrice) / position.entryPrice;
    const holdingTime = (Date.now() - position.entryTimestamp) / 1000;

    return profitLoss >= this.PROFIT_TAKE
      || profitLoss <= this.STOP_LOSS
      || analysis.rsi.value > this.MAX_RSI_EXIT
      || (holdingTime > 300 && analysis.volume.buyPressure < analysis.volume.sellPressure);
  }

  public async executeEntry(token: string, price: number, amount: number): Promise<void> {
    try {
      const mint = new PublicKey(token);
      const bondingCurve = await this.pumpFunSDK.getBondingCurveAccount(mint);
      if (!bondingCurve) {
        throw new Error('Bonding curve not found');
      }

      const globalAccount = await this.pumpFunSDK.getGlobalAccount();
      
      // Simulate the trade first
      const solAmount = BigInt(amount * 1e9); // Convert SOL to lamports
      const success = await this.simulator.simulateBuy(
        mint,
        bondingCurve,
        solAmount,
        globalAccount.initialVirtualTokenReserves
      );

      if (!success) {
        this.logger.warn('Simulation failed, skipping real trade');
        return;
      }

      // Log simulation stats
      const stats = this.simulator.getSimulationStats();
      this.logger.info('Current simulation stats:', stats);

      // In simulation mode, we don't execute the real trade
      if (process.env.SIMULATION_MODE === 'true') {
        return;
      }

      // Execute actual trade
      this.positions.set(token, {
        entryPrice: price,
        amount,
        entryTimestamp: Date.now()
      });

      this.lastTradeTime.set(token, Date.now());
      this.logger.info(`Entered position for ${token} at ${price} SOL`);
    } catch (error) {
      this.logger.error(`Entry execution error for ${token}:`, error);
      throw error;
    }
  }

  public async executeExit(token: string, price: number): Promise<void> {
    try {
      const position = this.positions.get(token);
      if (!position) return;

      const mint = new PublicKey(token);
      const bondingCurve = await this.pumpFunSDK.getBondingCurveAccount(mint);
      if (!bondingCurve) {
        throw new Error('Bonding curve not found');
      }

      const globalAccount = await this.pumpFunSDK.getGlobalAccount();
      
      // Simulate the sell
      const tokenAmount = BigInt(position.amount * 1e6); // Convert to smallest unit
      const success = await this.simulator.simulateSell(
        mint,
        bondingCurve,
        tokenAmount,
        globalAccount.initialVirtualTokenReserves,
        globalAccount.feeBasisPoints
      );

      if (!success) {
        this.logger.warn('Simulation failed, skipping real trade');
        return;
      }

      // Log simulation stats
      const stats = this.simulator.getSimulationStats();
      this.logger.info('Current simulation stats:', stats);

      // In simulation mode, we don't execute the real trade
      if (process.env.SIMULATION_MODE === 'true') {
        return;
      }

      const profitLoss = (price - position.entryPrice) / position.entryPrice;
      this.positions.delete(token);
      
      this.logger.info(`Exited position for ${token} at ${price} SOL (P/L: ${(profitLoss * 100).toFixed(2)}%)`);
    } catch (error) {
      this.logger.error(`Exit execution error for ${token}:`, error);
      throw error;
    }
  }

  public getActivePositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  public updateMetrics(token: string, metrics: TradeMetrics): void {
    this.metrics.set(token, metrics);
  }

  public addPriceData(token: string, data: PriceData): void {
    const history = this.priceHistory.get(token) || [];
    history.push(data);
    
    // Keep last 100 price points
    if (history.length > 100) {
      history.shift();
    }
    
    this.priceHistory.set(token, history);
  }
}
