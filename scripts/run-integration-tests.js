#!/usr/bin/env node
// scripts/run-integration-tests.js
//
// Runs src/boundaries/realCli.integration.test.ts against a REAL mockymock
// CLI checkout. Separate from `npm run test:unit` (which stays hermetic --
// see that test file's own header comment for why) so this only runs when
// explicitly asked for via `npm run test:integration`.
//
// Locates the CLI checkout via MOCKYMOCK_REAL_CLI_DIR if already set;
// otherwise tries a short list of candidate sibling checkouts (see
// CLI_DIR_CANDIDATES below) and uses the first one that actually contains
// mockymock/cli/main.py -- the module that gained the `fixtures` /
// `generate --with-data` subcommands this suite exercises. Set the env var
// yourself if your checkout layout matches none of them.
//
// Spawns node directly against mocha's own bin script rather than
// node_modules/.bin/mocha(.cmd): since Node's CVE-2024-27980 fix, spawning
// a .cmd/.bat file requires `shell: true`, which this deliberately avoids.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// Final review (Task 4): the original DEFAULT_CLI_DIR only resolved
// correctly when THIS repo is itself checked out as a nested worktree under
// .worktrees/<branch>/ (how this task was developed -- 4 hops up from
// scripts/ lands on the legacylens/ workspace root). Running the very same
// script from mocky-mock-vscode-extension's own PRIMARY checkout overshoots
// by one directory. Try a small list instead, in order:
//   1. the nested-worktree hop (original behavior)
//   2. the same target, but hopping from REPO_ROOT -- correct when REPO_ROOT
//      IS the primary checkout and mocky-mock's CLI changes still live on
//      its own unify-with-data worktree
//   3. plain sibling mocky-mock/ -- correct once unify-with-data has been
//      merged into mocky-mock's own primary checkout
const CLI_DIR_CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', '..', 'mocky-mock', '.worktrees', 'unify-with-data'),
  path.resolve(REPO_ROOT, '..', 'mocky-mock', '.worktrees', 'unify-with-data'),
  path.resolve(REPO_ROOT, '..', 'mocky-mock'),
];

function hasMockymockCli(dir) {
  return fs.existsSync(path.join(dir, 'mockymock', 'cli', 'main.py'));
}

const DEFAULT_CLI_DIR = CLI_DIR_CANDIDATES.find(hasMockymockCli);

const cliDir = process.env.MOCKYMOCK_REAL_CLI_DIR || DEFAULT_CLI_DIR;

if (!cliDir || !fs.existsSync(cliDir)) {
  console.error(
    'mockymock CLI checkout not found. Tried:\n' +
      CLI_DIR_CANDIDATES.map((dir) => `  ${dir}`).join('\n') +
      (process.env.MOCKYMOCK_REAL_CLI_DIR ? `\n  ${process.env.MOCKYMOCK_REAL_CLI_DIR} (MOCKYMOCK_REAL_CLI_DIR)` : '') +
      '\n\nSet MOCKYMOCK_REAL_CLI_DIR to a mocky-mock checkout new enough to have the ' +
      '`fixtures` subcommand before running `npm run test:integration`.'
  );
  process.exit(1);
}

const env = Object.assign({}, process.env, { MOCKYMOCK_REAL_CLI_DIR: cliDir });
const mochaEntry = path.join(REPO_ROOT, 'node_modules', 'mocha', 'bin', 'mocha.js');

console.log(`mockymock: running realCli integration suite against ${cliDir}`);

// --no-config: without it, mocha MERGES this positional file with
// .mocharc.json's own "spec": "src/**/*.test.ts" glob instead of
// overriding it (confirmed empirically -- both --spec and a bare
// positional arg have the same merge behavior on the mocha version this
// repo pins), so the whole hermetic suite would silently tag along. Passed
// explicitly instead: --require ts-node/register --extension ts (the two
// settings this test file actually needs from that config).
const result = spawnSync(
  process.execPath,
  [mochaEntry, '--no-config', '--require', 'ts-node/register', '--extension', 'ts',
    'src/boundaries/realCli.integration.test.ts'],
  { stdio: 'inherit', env, cwd: REPO_ROOT }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
