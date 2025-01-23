#!/bin/bash

# Fix the import path by exporting TokenListener properly
echo "export { TokenListener } from './tokenListener';" > src/services/pump-bot/index.ts

# Update the script to import from the index
cat > scripts/tokenListener.ts << 'EOL'
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { TokenListener } from '../src/services/pump-bot';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  if (!process.env.RPC_ENDPOINT || !process.env.WALLET_PRIVATE_KEY) {
    throw new Error('Missing required environment variables');
  }

  const connection = new Connection(process.env.RPC_ENDPOINT, {
    commitment: 'processed'
  });

  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.WALLET_PRIVATE_KEY))
  );
  const wallet = new Wallet(keypair);

  const listener = new TokenListener(connection, wallet);
  
  try {
    await listener.start();
    console.log('Token listener started successfully');
  } catch (error) {
    console.error('Failed to start listener:', error);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    listener.stop();
    process.exit();
  });
}

main().catch(console.error);
EOL

echo "Fixed module exports. Run with: npm run start:token-listener"