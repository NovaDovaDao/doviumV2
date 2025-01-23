import { Connection, Commitment } from '@solana/web3.js';

export const createConnection = (
  endpoint: string,
  commitment: Commitment = 'confirmed'
): Connection => {
  return new Connection(endpoint, {
    commitment,
    confirmTransactionInitialTimeout: 60000
  });
};
