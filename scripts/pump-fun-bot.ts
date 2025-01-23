import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { VolumeBot, VolumeStrategyConfig } from '../src/services/strategies/volumeBot';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const wallet = Keypair.fromSecretKey(Buffer.from(process.env.WALLET_PRIVATE_KEY!, 'base64'));

  const config: VolumeStrategyConfig = {
    minSolAmount: 0.01,
    maxSolAmount: 0.05,
    minInterval: 1000,
    maxInterval: 5000,
    targetDailyVolume: 1000,
    stopLoss: 10,
    tokenMint: new PublicKey(process.env.TOKEN_MINT!)
  };

  const bot = new VolumeBot(connection, wallet, config);
  await bot.start();
}

main().catch(console.error);
