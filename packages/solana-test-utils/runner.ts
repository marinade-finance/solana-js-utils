import { SignerWallet, sleep, SolanaProvider } from '@saberhq/solana-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { spawn } from 'child_process';
import { parseKeypair } from '@marinade.finance/solana-cli-utils';

export async function run(bpfPrograms: { address: PublicKey; path: string }[]) {
  let args: string[] = [];
  bpfPrograms.forEach(({ path, address }) => {
    args = args.concat(['--bpf-program', address.toBase58(), path]);
  });
  console.log('Starting test validator');
  const testValidator = spawn('solana-test-validator', args);

  testValidator.stderr.on('data', data => console.log(data.toString('latin1')));
  try {
    let closed = false;
    testValidator.on('close', code => {
      closed = true;
    });
    const provider = SolanaProvider.init({
      connection: new Connection('http://localhost:8899'),
      wallet: new SignerWallet(await parseKeypair('~/.config/solana/id.json')),
    });

    let wait = 80000;
    const step = 100;
    while (wait > 0 && !closed) {
      try {
        await provider.connection.getLatestBlockhash();
        break;
      } catch (e) {
        await sleep(step);
        wait -= step;
      }
    }
    if (closed) {
      throw new Error('Test validator was closed');
    }
    if (wait <= 0) {
      throw new Error(
        'Unable to get latest blockhash. Test validator does not look started'
      );
    }
    console.log('Test validator online');

    const test = spawn('pnpm', ['_test'], { stdio: 'inherit' });
    await new Promise((resolve, reject) =>
      test.on('close', code => {
        if (code) {
          reject(code);
        } else {
          resolve(null);
        }
      })
    );
  } finally {
    testValidator.kill();
  }
}
