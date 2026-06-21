import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Walk up from this file to the monorepo root (the dir containing turbo.json). */
export function findRepoRoot(start: string = __dirname): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'turbo.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start, '../../../..');
}
