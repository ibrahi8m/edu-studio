// Builds an earlier released version from git so the upgrade test can run the
// real old app, create data in it, then open the same browser profile with the
// current build. Usage: node scripts/build-legacy.mjs [commit] [version]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const commit = process.argv[2] ?? 'a4bfde7'; // Phase 1 release, version 0.2.0
const version = process.argv[3] ?? '0.2.0';
const dir = resolve('.legacy', version);

if (existsSync(resolve(dir, 'dist', 'index.html'))) {
  console.log(`legacy ${version} already built at ${dir}`);
  process.exit(0);
}
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
execSync(`git archive ${commit} | tar -x -C "${dir}"`, { stdio: 'inherit', shell: '/bin/bash' });
symlinkSync(resolve('node_modules'), resolve(dir, 'node_modules'), 'dir');
execSync('npx tsc -b && npx vite build', { cwd: dir, stdio: 'inherit', shell: '/bin/bash' });
console.log(`built legacy ${version} (${commit}) at ${dir}/dist`);
