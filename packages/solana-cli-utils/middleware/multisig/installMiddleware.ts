import { GokiSDK } from '@gokiprotocol/client';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Middleware } from '..';
import { GokiMiddleware } from './GokiMiddleware';
import { MultisigMiddlewareBase } from './MultisigMiddlewareBase';
import { SplGovernanceMiddleware, DEFAULT_REALM_PUBKEY, KNOWN_REALM_PUBKEYS } from './SplGovernanceMiddleware';
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
import { encode } from '@project-serum/anchor/dist/cjs/utils/bytes/utf8';
import { PROGRAM_VERSION_V3 } from '@marinade.finance/spl-governance';

export async function installMultisigMiddleware({
  middleware,
  goki,
  kedgeree,
  address,
  proposer,
  rentPayer,
  logOnly,
  community,
  govProgId = DEFAULT_REALM_PUBKEY,
  govProgVersion = PROGRAM_VERSION_V3,
}: {
  middleware: Middleware[];
  goki: GokiSDK;
  kedgeree: KedgereeSDK;
  address: PublicKey;
  proposer?: Keypair;
  rentPayer?: Keypair;
  logOnly?: boolean;
  community?: boolean;
  govProgId?: PublicKey;
  govProgVersion?: number;
}) {
  // Prevent doublication of multisig
  for (const m of middleware) {
    if (m instanceof MultisigMiddlewareBase && m.signingBy.equals(address)) {
      return;
    }
  }
  const account = await goki.provider.getAccountInfo(address);
  if (account && !account.accountInfo.owner.equals(SystemProgram.programId)) {
    if (account.accountInfo.owner.equals(goki.programs.SmartWallet.programId)) {
      middleware.push(
        await GokiMiddleware.create({
          sdk: goki,
          account: address,
          proposer,
          rentPayer,
        })
      );
    } else if (account.accountInfo.owner.equals(govProgId)) {
      middleware.push(
        await SplGovernanceMiddleware.create({
          provider: goki.provider,
          splGovId: govProgId,
          splGovVersion: govProgVersion,
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
    if (!keyInfo) {
      return;
    }
    const knownGovProgIds = KNOWN_REALM_PUBKEYS.concat(govProgId);
    if (knownGovProgIds.find(progId => progId.equals(keyInfo.owner))) {
      const NATIVE_TREASURY_SEED = encode('native-treasury');
      if (
        Buffer.from(
          keyInfo.seeds.subarray(0, NATIVE_TREASURY_SEED.length)
        ).equals(NATIVE_TREASURY_SEED)
      ) {
        middleware.push(
          await SplGovernanceMiddleware.create({
            provider: goki.provider,
            splGovId: govProgId,
            splGovVersion: govProgVersion,
            account: new PublicKey(
              keyInfo.seeds.subarray(
                NATIVE_TREASURY_SEED.length,
                NATIVE_TREASURY_SEED.length + 32
              )
            ),
            proposer,
            rentPayer,
            logOnly,
            community,
            signingBy: address,
          })
        );
      } else {
        throw new Error(`Unknown PDA seed scheme ${keyInfo.seeds}`);
      }
    } else {
      throw new Error(`Unknown multisig program ${keyInfo.owner.toBase58()}`);
    }
  }
}
