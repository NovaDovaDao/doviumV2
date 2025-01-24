import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TradingSimulator } from '../src/services/simulation/tradingSimulator';
import { PumpFunSDK } from '../src/services/pumpfun/pumpfun';
import { Provider, AnchorProvider, Wallet, BorshEventCoder } from '@coral-xyz/anchor';
import * as IDL from '../src/services/pumpfun/IDL/pump-fun.json';
import { Logger } from '../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();
const logger = new Logger();

class SimulationManager {
    private simulator: TradingSimulator;
    private subscriptionId: number | null = null;
    private eventCoder: BorshEventCoder;

    constructor(
        private connection: Connection,
        private pumpFunSDK: PumpFunSDK
    ) {
        this.simulator = new TradingSimulator(1); // Start with 1 SOL
        this.eventCoder = new BorshEventCoder(IDL);
    }

    async start() {
        logger.info('Starting simulation manager...');
        
        try {
            // Subscribe to program logs
            this.subscriptionId = this.connection.onLogs(
                new PublicKey(IDL.address),
                this.handleProgramLogs.bind(this),
                'processed'
            );
            
            logger.info('Simulation manager started successfully');
        } catch (error) {
            logger.error('Error starting simulation manager:', error);
            throw error;
        }
    }

    private async handleProgramLogs(logs: {
        err: any;
        logs: string[];
        signature: string;
    }) {
        try {
            if (!logs.logs?.length) return;

            for (const log of logs.logs) {
                if (!log.includes('Program data:')) continue;

                try {
                    const logData = log.split('Program data: ')[1];
                    const eventData = Buffer.from(logData, 'base64');
                    const event = this.eventCoder.decode(eventData.toString());

                    if (event?.name !== 'createEvent') continue;

                    logger.info('New token detected:', {
                        name: event.data.name,
                        symbol: event.data.symbol,
                        mint: event.data.mint.toString(),
                        bondingCurve: event.data.bondingCurve.toString()
                    });

                    // Process the new token
                    await this.processNewToken(
                        new PublicKey(event.data.mint),
                        new PublicKey(event.data.bondingCurve)
                    );

                } catch (e) {
                    logger.error('Error processing event:', e);
                }
            }
        } catch (error) {
            logger.error('Error handling program logs:', error);
        }
    }

    private async processNewToken(mint: PublicKey, bondingCurve: PublicKey) {
        try {
            // Get the bonding curve account
            const bondingCurveAccount = await this.pumpFunSDK.getBondingCurveAccount(mint);
            if (!bondingCurveAccount) {
                logger.warn('No bonding curve found for token');
                return;
            }

            const globalAccount = await this.pumpFunSDK.getGlobalAccount();

            // Simulate a buy with 0.1 SOL
            const buyAmount = BigInt(0.1 * 1e9); // 0.1 SOL in lamports
            const success = await this.simulator.simulateBuy(
                mint,
                bondingCurveAccount,
                buyAmount,
                globalAccount.initialVirtualTokenReserves
            );

            if (success) {
                // Wait for some price movement (simulated by waiting 10 seconds)
                await new Promise(resolve => setTimeout(resolve, 10000));

                // Get updated bonding curve
                const updatedBondingCurve = await this.pumpFunSDK.getBondingCurveAccount(mint);
                if (!updatedBondingCurve) return;

                // Get position and simulate sell
                const position = this.simulator.getSimulationStats().openPositions
                    .find(pos => pos.mint === mint.toString());

                if (position) {
                    await this.simulator.simulateSell(
                        mint,
                        updatedBondingCurve,
                        BigInt(position.tokenAmount * 1e6), // Convert to raw amount
                        globalAccount.initialVirtualTokenReserves,
                        globalAccount.feeBasisPoints
                    );
                }
            }

            // Log simulation stats
            const stats = this.simulator.getSimulationStats();
            logger.info('Current simulation stats:', stats);

        } catch (error) {
            logger.error('Error processing new token:', error);
        }
    }

    stop() {
        if (this.subscriptionId !== null) {
            this.connection.removeOnLogsListener(this.subscriptionId);
        }
        logger.info('Simulation manager stopped');
    }
}

async function main() {
    if (!process.env.SOLANA_RPC_URL || !process.env.WALLET_PRIVATE_KEY) {
        throw new Error('Missing required environment variables');
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL, {
        commitment: 'processed'
    });

    const keypair = Keypair.fromSecretKey(
        Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64')
    );
    
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'processed'
    });

    const pumpFunSDK = new PumpFunSDK(provider);
    const simulationManager = new SimulationManager(connection, pumpFunSDK);

    try {
        await simulationManager.start();
        logger.info('Simulation started successfully');
    } catch (error) {
        logger.error('Failed to start simulation:', error);
        process.exit(1);
    }

    process.on('SIGINT', () => {
        logger.info('Gracefully shutting down...');
        simulationManager.stop();
        process.exit();
    });
}

main().catch((error) => {
    logger.error('Simulation failed:', error);
    process.exit(1);
});
