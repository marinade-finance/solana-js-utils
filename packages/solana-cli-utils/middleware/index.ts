import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';

export * from './multisig';

export interface Middleware {
  programId: PublicKey;

  apply(tx: TransactionEnvelope): Promise<TransactionEnvelope>;
}
