import {
  Provider,
  PublicKey,
  TransactionEnvelope,
  Wallet,
} from '@saberhq/solana-contrib';
import { Keypair } from '@solana/web3.js';

export interface SignerHelper {
  authority: PublicKey;
  runTx(tx: TransactionEnvelope): Promise<void>;
  signTx(tx: TransactionEnvelope): boolean;
  canSign: boolean;
}

export class WalletSignerHelper implements SignerHelper {
  constructor(public readonly wallet: Wallet) {}

  get authority() {
    return this.wallet.publicKey;
  }

  async runTx(tx: TransactionEnvelope): Promise<void> {
    await tx.confirm();
  }

  signTx(_: TransactionEnvelope): boolean {
    return true; // Already signed
  }

  get canSign() {
    return true;
  }
}

export class KeypairSignerHelper implements SignerHelper {
  constructor(public readonly keypair: Keypair) {}

  get authority() {
    return this.keypair.publicKey;
  }

  async runTx(tx: TransactionEnvelope): Promise<void> {
    this.signTx(tx);
    await tx.confirm();
  }

  signTx(tx: TransactionEnvelope): boolean {
    tx.addSigners(this.keypair);
    return true;
  }

  get canSign() {
    return true;
  }
}

export class PDASigner implements SignerHelper {
  constructor(public readonly authority: PublicKey) {}

  runTx(_: TransactionEnvelope): Promise<void> {
    throw new Error('Use another contract to sign PDA');
  }

  signTx(_: TransactionEnvelope): boolean {
    throw new Error('Use another contract to sign PDA');
  }

  get canSign() {
    return false;
  }
}
