import { GokiSDK } from '@gokiprotocol/client';
import { Provider } from '@saberhq/solana-contrib';
import BN from 'bn.js';
import { SignerHelper } from '../signer';
import { GokiHelper } from './goki';
import { MultisigHelper } from './multisig';
import { SplGovHelper, TokenOwnerRecordSide } from './splGov';

export { MultisigHelper } from './multisig';
export { GokiHelper } from './goki';

export interface MultisigFacotry {
  name: string;
  create: (config: {
    provider: Provider;
    members?: SignerHelper[];
    threshold?: BN;
    side?: TokenOwnerRecordSide;
  }) => Promise<MultisigHelper>;
}

export const MULTISIG_FACTORIES: MultisigFacotry[] = [
  {
    name: 'Goki',
    create: ({ provider, members, threshold }) =>
      GokiHelper.create({
        members,
        threshold,
        goki: GokiSDK.load({ provider }),
      }),
  },
  {
    name: 'Spl-gov',
    create: ({ provider, members, threshold, side = 'council' }) =>
      SplGovHelper.create({
        provider,
        members,
        threshold,
        side,
      }),
  },
];
