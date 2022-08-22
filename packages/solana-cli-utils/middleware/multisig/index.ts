import { GokiSDK } from '@gokiprotocol/client';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Middleware } from '..';
import { GokiMiddleware } from './GokiMiddleware';
import { SplGovDataMiddleware } from './SplGovDataMiddleware';

export { GokiMiddleware } from './GokiMiddleware';
export { SplGovDataMiddleware } from './SplGovDataMiddleware';

export async function installMultisigMiddleware({
  middleware,
  goki,
  address,
  proposer,
  rentPayer,
}: {
  middleware: Middleware[];
  goki: GokiSDK;
  address: PublicKey;
  proposer?: Keypair;
  rentPayer?: Keypair;
}) {
  const account = await goki.provider.getAccountInfo(address);
  if (account) {
    if (account.accountInfo.owner.equals(goki.programs.SmartWallet.programId)) {
      middleware.push(
        await GokiMiddleware.create({
          sdk: goki,
          account: address,
          proposer,
          rentPayer,
        })
      );
    } else if (account.accountInfo.owner.equals(SplGovDataMiddleware.PROG_ID)) {
      middleware.push(
        await SplGovDataMiddleware.create({
          account: address,
        })
      );
    }
  }
}
