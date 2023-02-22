import { Keypair, Connection } from '@solana/web3.js'
import { SolanaProvider, SignerWallet } from '@saberhq/solana-contrib'
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk'
import {
  PROGRAM_VERSION_V3,
  VoteChoice,
  Vote,
  VoteKind,
} from '@marinade.finance/spl-governance'
import {
  GovernanceHelper,
  ProposalHelper,
  RealmHelper,
  TokenOwnerRecordHelper,
} from '../multisig'
import {
  MintHelper,
} from '../mint'
import { KeypairSignerHelper } from '../signer'
import { parseKeypair } from '@marinade.finance/solana-cli-utils';

describe('Running SPL Goveranance operations', () => {

  let provider: SolanaProvider

  beforeAll(async () => {
    provider = SolanaProvider.init({
      connection: new Connection('http://localhost:8899', { commitment: 'processed' }),
      wallet: new SignerWallet(await parseKeypair('~/.config/solana/id.json')),
    });
  });

  it('It runs single choice survey from the creation to finalization', async () => {
    const kedgeree = new KedgereeSDK({ provider })
    const realmHelper = await RealmHelper.create({
      provider,
      splGovVersion: PROGRAM_VERSION_V3,
      communityMint: await MintHelper.create({ provider }),
      councilMint: await MintHelper.create({ provider }),
    })
    console.log('Realm created', realmHelper.address.toBase58())

    const createGovernanceRecord = await TokenOwnerRecordHelper.create({
      realm: realmHelper,
      side: 'community',
      owner: new KeypairSignerHelper(Keypair.generate()),
    })
    await createGovernanceRecord.deposit(1000)
    console.log('Token owner record created', createGovernanceRecord.address.toBase58())
    const governance = await GovernanceHelper.create({
      tokenOwnerRecord: createGovernanceRecord,
      kedgeree,
      communityYesVotePercentage: 10,
      maxVotingTime: 3, // need to be long enough to be able to vote, but short to not wait long
    })

    const numberChoices = 3
    const options = Array.from(Array(numberChoices).keys()).map(i => '' + i)
    console.log(
      'Creating a proposal - realm:', realmHelper.address.toBase58(),
      'governance:', governance.address.toBase58(), 'options:', options
    )
    const proposal = await ProposalHelper.create({
      name: 'test',
      descriptionLink: 'http://test',
      governance,
      ownerRecord: createGovernanceRecord,
      side: 'community',
      options,
      useDenyOption: false,
    })
    console.log('Proposal created and signed', proposal.address.toBase58())

    // and when proposal is created and signed-off, let's cast a vote
    const votes = [...new Array(numberChoices)].map(
      () =>
        new VoteChoice({
          rank: 0,
          weightPercentage: 0,
        })
    )
    if (numberChoices > 0) votes[0].weightPercentage = 100 // first option voted at 100%
    const vote = new Vote({
      voteType: VoteKind.Approve,
      approveChoices: votes,
      deny: undefined,
      veto: undefined,
    })
    await proposal.castVote({
      vote,
      tokenOwnerRecord: createGovernanceRecord,
    })
    await proposal.finalize()
    
    // Succeed == 3, Completed == 5; useDenyOption == false ==> Completed after finalized
    console.log('finalized proposal', proposal.address.toBase58())
    expect(proposal.data.account.state).toEqual(5)
  })
})
