import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';

export { GokiMiddleware } from './multisig';
export { SplGovDataMiddleware } from './multisig';
export { installMultisigMiddleware } from './multisig';

export interface Middleware {
  programId: PublicKey;

  apply(tx: TransactionEnvelope): Promise<TransactionEnvelope>;
}
