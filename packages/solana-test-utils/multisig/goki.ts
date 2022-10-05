import {
  findTransactionAddress,
  GokiSDK,
  SmartWalletTransactionData,
  SmartWalletWrapper,
} from '@gokiprotocol/client';
import {
  TransactionEnvelope,
  TransactionReceipt,
} from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { SignerHelper, WalletSignerHelper } from '../signer';
import { MultisigHelper } from './multisig';

export class GokiHelper implements MultisigHelper {
  private constructor(
    public readonly goki: GokiSDK,
    public readonly members: SignerHelper[],
    public readonly smartWalletWrapper: SmartWalletWrapper
  ) {}

  signTx(tx: TransactionEnvelope): boolean {
    throw new Error('Can not sign');
  }

  get canSign() {
    return false;
  }

  get threshold() {
    return this.smartWalletWrapper.data!.threshold.toNumber();
  }

  static async create({
    goki,
    members = [new WalletSignerHelper(goki.provider.wallet)],
    threshold = 1,
  }: {
    goki: GokiSDK;
    members?: SignerHelper[];
    threshold?: number;
  }): Promise<GokiHelper> {
    const { smartWalletWrapper, tx } = await goki.newSmartWallet({
      owners: members.map(m => m.authority),
      threshold: new BN(threshold),
      numOwners: members.length,
    });
    await tx.confirm();
    return new GokiHelper(goki, members, smartWalletWrapper);
  }

  async runTx(inner: TransactionEnvelope): Promise<TransactionReceipt[]> {
    const { tx, transactionKey } =
      await this.smartWalletWrapper.newTransactionFromEnvelope({
        tx: inner,
        proposer: this.members[0].authority,
        payer: this.goki.provider.walletKey,
      });
    await this.members[0].runTx(tx);
    return await this.executeTransaction(
      transactionKey,
      await this.smartWalletWrapper.fetchTransaction(transactionKey)
    );
  }

  async executeAllPending(): Promise<TransactionReceipt[]> {
    await this.smartWalletWrapper.reloadData();
    const txCount = this.smartWalletWrapper.data!.numTransactions.toNumber();
    const results: TransactionReceipt[] = [];
    for (let i = 0; i < txCount; i++) {
      const info = (await this.smartWalletWrapper.fetchTransactionByIndex(i))!;
      if (info.executedAt.eqn(-1)) {
        results.push(
          ...(await this.executeTransaction(
            await this.transactionByIndex(i),
            info
          ))
        );
      }
    }
    return results;
  }

  async executeTransaction(
    address: PublicKey,
    info: SmartWalletTransactionData
  ): Promise<TransactionReceipt[]> {
    let signersLeft =
      this.smartWalletWrapper.data!.threshold.toNumber() -
      info.signers.filter(s => s).length;
    let tx = new TransactionEnvelope(this.goki.provider, []);
    for (let i = 0; i < info.signers.length && signersLeft > 0; i++) {
      if (!info.signers[i]) {
        tx = tx.combine(
          this.smartWalletWrapper.approveTransaction(
            address,
            this.members[i].authority
          )
        );
        this.members[i].signTx(tx);
        signersLeft--;
      }
    }
    tx = tx.combine(
      await this.smartWalletWrapper.executeTransaction({
        transactionKey: address,
        owner: this.members[0].authority,
      })
    );
    this.members[0].signTx(tx);

    const result = [];
    for (const part of tx.partition()) {
      result.push(await part.confirm());
    }
    return result;
  }

  get authority() {
    return this.smartWalletWrapper.key;
  }

  get numTransactions() {
    return this.smartWalletWrapper.data!.numTransactions;
  }

  async reload(): Promise<void> {
    await this.smartWalletWrapper.reloadData();
  }

  async transactionByIndex(index: number): Promise<PublicKey> {
    const [tx] = await findTransactionAddress(
      this.smartWalletWrapper.key,
      index
    );
    return tx;
  }
}
