import { GokiSDK } from '@gokiprotocol/client';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Middleware } from '..';
import { GokiMiddleware } from './GokiMiddleware';
import { MultisigMiddlewareBase } from './MultisigMiddlewareBase';
import { SplGovernanceMiddleware } from './SplGovernanceMiddleware';
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
import { encode } from '@project-serum/anchor/dist/cjs/utils/bytes/utf8';

export { GokiMiddleware } from './GokiMiddleware';
export { SplGovernanceMiddleware as SplGovDataMiddleware } from './SplGovernanceMiddleware';

export async function installMultisigMiddleware({
  middleware,
  goki,
  kedgeree,
  address,
  proposer,
  rentPayer,
  logOnly,
  community,
}: {
  middleware: Middleware[];
  goki: GokiSDK;
  kedgeree: KedgereeSDK;
  address: PublicKey;
  proposer?: Keypair;
  rentPayer?: Keypair;
  logOnly?: boolean;
  community?: boolean;
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
          community,
        })
      );
    }
  } else {
    const keyInfo = await kedgeree.loadKeyInfo(address);
    if (keyInfo && keyInfo.owner.equals(SplGovernanceMiddleware.PROG_ID)) {
      const ACCOUNT_GOVERNANCE_SEED = encode('account-governance');
      if (
        Buffer.from(
          keyInfo.seeds.subarray(0, ACCOUNT_GOVERNANCE_SEED.length)
        ).equals(ACCOUNT_GOVERNANCE_SEED)
      ) {
        middleware.push(
          await SplGovernanceMiddleware.create({
            provider: goki.provider,
            account: new PublicKey(
              keyInfo.seeds.subarray(
                ACCOUNT_GOVERNANCE_SEED.length,
                ACCOUNT_GOVERNANCE_SEED.length + 32
              )
            ),
            proposer,
            rentPayer,
            logOnly,
            community,
          })
        );
      }
    }
  }
}
