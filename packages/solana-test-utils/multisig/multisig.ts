import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { SignerHelper } from '../signer';

export abstract class MultisigHelper implements SignerHelper {
  protected constructor(
    public readonly members: SignerHelper[],
    public readonly threshold: BN
  ) {}
  async runTx(tx: TransactionEnvelope): Promise<void> {
    const txAddress = await this.createTransaction(tx);
    await this.executeTransaction(txAddress);
  }

  signTx(_: TransactionEnvelope): boolean {
    return false; // Can not sign
  }

  get canSign() {
    return false;
  }

  abstract createTransaction(tx: TransactionEnvelope): Promise<PublicKey>;
  abstract executeTransaction(address: PublicKey): Promise<void>;
  abstract get authority(): PublicKey;
  abstract get numTransactions(): BN;
  abstract reload(): Promise<void>;
  abstract transactionByIndex(index: BN): Promise<PublicKey>;
}
