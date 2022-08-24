import { file } from 'tmp-promise';
import { Keypair } from '@solana/web3.js';
import { fs } from 'mz';

export const createTempFileKeypair = async (seed?: Keypair) => {
  const keypair = seed ?? new Keypair();

  const { path, cleanup } = await file();
  await fs.writeFile(path, JSON.stringify(Array.from(keypair.secretKey)));
  return { path, cleanup, keypair };
};
