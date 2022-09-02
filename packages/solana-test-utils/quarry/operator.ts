import { Operator, QuarrySDK } from '@quarryprotocol/quarry-sdk';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import { SignerHelper, WalletSignerHelper } from '../signer';

export interface PendingOperatorHelper {
  tx: TransactionEnvelope;
  key: PublicKey;
  factory(): Promise<OperatorHelper>;
}

export type OperatorHelperFactory = (
  rewarder: PublicKey
) => Promise<PendingOperatorHelper>;

export class OperatorHelper {
  // TODO implement SignerHelper
  private constructor(
    public readonly wrapper: Operator,
    public readonly admin: SignerHelper,
    public readonly rateSetter: SignerHelper,
    public readonly shareAllocator: SignerHelper,
    public readonly quarryCreator: SignerHelper
  ) {}

  static prepare({
    sdk,
    admin = new WalletSignerHelper(sdk.provider.wallet),
    rateSetter = new WalletSignerHelper(sdk.provider.wallet),
    shareAllocator = new WalletSignerHelper(sdk.provider.wallet),
    quarryCreator = new WalletSignerHelper(sdk.provider.wallet),
  }: {
    sdk: QuarrySDK;
    admin?: SignerHelper;
    rateSetter?: SignerHelper;
    shareAllocator?: SignerHelper;
    quarryCreator?: SignerHelper;
  }): OperatorHelperFactory {
    return async (rewarder: PublicKey) => {
      const { key, tx } = await sdk.createOperator({
        rewarder,
      }); // Admin is wallet for now

      if (!rateSetter.authority.equals(sdk.provider.walletKey)) {
        tx.append(
          await sdk.programs.Operator.methods
            .setRateSetter()
            .accounts({
              operator: key,
              delegate: rateSetter.authority,
            })
            .instruction()
        );
      }

      if (!shareAllocator.authority.equals(sdk.provider.walletKey)) {
        tx.append(
          await sdk.programs.Operator.methods
            .setShareAllocator()
            .accounts({
              operator: key,
              delegate: shareAllocator.authority,
            })
            .instruction()
        );
      }

      if (!quarryCreator.authority.equals(sdk.provider.walletKey)) {
        tx.append(
          await sdk.programs.Operator.methods
            .setQuarryCreator()
            .accounts({
              operator: key,
              delegate: quarryCreator.authority,
            })
            .instruction()
        );
      }

      if (!admin.authority.equals(sdk.provider.walletKey)) {
        tx.append(
          await sdk.programs.Operator.methods
            .setAdmin()
            .accounts({
              operator: key,
              delegate: admin.authority,
            })
            .instruction()
        );
      }

      return {
        tx,
        key,
        async factory() {
          return new OperatorHelper(
            (await sdk.loadOperator(key))!,
            admin,
            rateSetter,
            shareAllocator,
            quarryCreator
          );
        },
      };
    };
  }
}
