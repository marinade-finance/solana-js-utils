import {
  findTransactionAddress,
  GokiSDK,
  SmartWalletWrapper,
} from '@gokiprotocol/client';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { SignerHelper, WalletSignerHelper } from '../signer';
import { MultisigHelper } from './multisig';

export class GokiHelper extends MultisigHelper {
  private constructor(
    public readonly goki: GokiSDK,
    members: SignerHelper[],
    threshold: BN,
    public readonly smartWalletWrapper: SmartWalletWrapper
  ) {
    super(members, threshold);
  }

  static async create({
    goki,
    members = [new WalletSignerHelper(goki.provider.wallet)],
    threshold = new BN(1),
  }: {
    goki: GokiSDK;
    members?: SignerHelper[];
    threshold?: BN;
  }): Promise<GokiHelper> {
    const { smartWalletWrapper, tx } = await goki.newSmartWallet({
      owners: members.map(m => m.authority),
      threshold,
      numOwners: members.length + 1,
    });
    await tx.confirm();
    return new GokiHelper(goki, members, threshold, smartWalletWrapper);
  }

  async createTransaction(inner: TransactionEnvelope): Promise<PublicKey> {
    const { tx, transactionKey } =
      await this.smartWalletWrapper.newTransactionFromEnvelope({
        tx: inner,
        proposer: this.members[0].authority,
        payer: this.goki.provider.walletKey,
      });

    await this.members[0].runTx(tx);
    await this.smartWalletWrapper.reloadData();
    return transactionKey;
  }

  async executeTransaction(address: PublicKey): Promise<void> {
    const info = await this.smartWalletWrapper.fetchTransaction(address);
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

    await this.members[0].runTx(tx);
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

  async transactionByIndex(index: BN): Promise<PublicKey> {
    const [tx] = await findTransactionAddress(
      this.smartWalletWrapper.key,
      index.toNumber()
    );
    return tx;
  }
}
