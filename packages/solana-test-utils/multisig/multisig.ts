import { TransactionReceipt } from '@saberhq/solana-contrib';
import { SignerHelper } from '../signer';

export interface MultisigHelper extends SignerHelper {
  readonly members: SignerHelper[];
  readonly threshold: number;
  executeAllPending(): Promise<TransactionReceipt[]>;
}
