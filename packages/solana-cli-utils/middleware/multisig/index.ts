import { GokiSDK } from '@gokiprotocol/client';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Middleware } from '..';
import { GokiMiddleware } from './GokiMiddleware';
import { MultisigMiddlewareBase } from './MultisigMiddlewareBase';
import { SplGovernanceMiddleware } from './SplGovernanceMiddleware';

export { GokiMiddleware } from './GokiMiddleware';
export { SplGovernanceMiddleware as SplGovDataMiddleware } from './SplGovernanceMiddleware';

export async function installMultisigMiddleware({
  middleware,
  goki,
  address,
  proposer,
  rentPayer,
  logOnly,
}: {
  middleware: Middleware[];
  goki: GokiSDK;
  address: PublicKey;
  proposer?: Keypair;
  rentPayer?: Keypair;
  logOnly?: boolean;
}) {
  // Prevent doublication of multisig
  for (const m of middleware) {
    if (m instanceof MultisigMiddlewareBase && m.signingBy.equals(address)) {
      return;
    }
  }
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
    } else if (
      account.accountInfo.owner.equals(SplGovernanceMiddleware.PROG_ID)
    ) {
      middleware.push(
        await SplGovernanceMiddleware.create({
          provider: goki.provider,
          account: address,
          proposer,
          rentPayer,
          logOnly,
        })
      );
    }
  }
}
