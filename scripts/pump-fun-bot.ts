import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PumpStrategy } from '../src/services/strategies/PumpStrategy';
import { PumpFunSDK } from '../src/services/pumpfun/pumpfun';
import { SwapService } from '../src/services/trading/swapService';
import { OrderService } from '../src/services/trading/orderService';
import { Provider, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  if (!process.env.SOLANA_RPC_URL || !process.env.WALLET_PRIVATE_KEY) {
    throw new Error('Missing required environment variables');
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL, {
    commitment: 'processed',
    wsEndpoint: process.env.SOLANA_WS_URL
  });

  const keypair = Keypair.fromSecretKey(
    Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64')
  );
  
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'processed'
  });

  const pumpFunSDK = new PumpFunSDK(provider);
  const swapService = new SwapService(connection);
  const orderService = new OrderService();

  const strategy = new PumpStrategy(
    pumpFunSDK,
    swapService,
    orderService,
    keypair.publicKey,
    {
      minSolBalance: 0.1,
      maxPositionSize: 0.5,
      rsiOversold: 30,
      rsiOverbought: 70,
      profitTarget: 0.15,
      stopLoss: 0.05,
      macdThreshold: 0,
      volumeThreshold: 1,
      depthRatioThreshold: 1.2
    }
  );

  // Subscribe to slot updates
  connection.onSlotChange((slot) => {
    strategy.onBlockUpdate(slot.slot).catch(console.error);
  });

  console.log('Bot started successfully');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down bot...');
    // Cleanup code here if needed
    process.exit();
  });
}

main().catch((error) => {
  console.error('Bot crashed:', error);
  process.exit(1);
});
