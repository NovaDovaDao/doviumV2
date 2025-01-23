import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BorshEventCoder } from '@coral-xyz/anchor';
import { type PumpFun } from '../IDL/pump-fun';
import * as dotenv from 'dotenv';
import * as IDL from '../IDL/pump-fun.json';

class Logger {
  info(message: string, data?: any) {
    console.log(`[INFO] ${message}`, data || '');
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error || '');
  }

  warn(message: string, data?: any) {
    console.warn(`[WARN] ${message}`, data || '');
  }
}

class TokenListener {
  private logger: Logger;
  private program: Program<PumpFun>;
  private eventCoder: BorshEventCoder;
  private lastProcessedSlot: number = 0;
  private subscriptionId: number | null = null;

  constructor(
    private connection: Connection,
    wallet: Wallet
  ) {
    this.logger = new Logger();
    
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'processed' }
    );

    this.program = new Program<PumpFun>(
      IDL as PumpFun,
      IDL.address,
      provider
    );

    this.eventCoder = new BorshEventCoder(IDL);
  }

  async start() {
    this.logger.info('Starting token listener...');
    
    try {
      this.subscriptionId = this.connection.onLogs(
        new PublicKey(IDL.address),
        this.handleProgramLogs.bind(this),
        'processed'
      );
      
      this.lastProcessedSlot = await this.connection.getSlot();
      this.logger.info('Listener started successfully');
    } catch (error) {
      this.logger.error('Error starting listener:', error);
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

          this.logger.info('New token created:', {
            name: event.data.name,
            symbol: event.data.symbol,
            mint: event.data.mint.toString(),
            bondingCurve: event.data.bondingCurve.toString(),
            creator: event.data.user.toString()
          });

          const curveAccount = await this.connection.getAccountInfo(event.data.bondingCurve);
          if (curveAccount) {
            this.logger.info('Bonding curve details:', {
              lamports: curveAccount.lamports,
              owner: curveAccount.owner.toString(),
              space: curveAccount.data.length
            });
          }
        } catch (e) {
          this.logger.error('Error processing event:', e);
        }
      }
    } catch (error) {
      this.logger.error('Error handling program logs:', error);
    }
  }

  stop() {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
    }
    this.logger.info('Token listener stopped');
  }
}

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