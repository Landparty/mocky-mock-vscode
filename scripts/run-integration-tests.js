#!/usr/bin/env node
// scripts/run-integration-tests.js
//
// Runs src/boundaries/realCli.integration.test.ts against a REAL mockymock
// CLI checkout. Separate from `npm run test:unit` (which stays hermetic --
// see that test file's own header comment for why) so this only runs when
// explicitly asked for via `npm run test:integration`.
//
// Locates the CLI checkout via MOCKYMOCK_REAL_CLI_DIR if already set,
// otherwise defaults to the sibling mocky-mock worktree this task was
// developed against (adjust DEFAULT_CLI_DIR, or just set the env var
// yourself, if your checkout layout differs).
//
// Spawns node directly against mocha's own bin script rather than
// node_modules/.bin/mocha(.cmd): since Node's CVE-2024-27980 fix, spawning
// a .cmd/.bat file requires `shell: true`, which this deliberately avoids.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_CLI_DIR = path.resolve(
  __dirname, '..', '..', '..', '..', 'mocky-mock', '.worktrees', 'unify-with-data'
);

const cliDir = process.env.MOCKYMOCK_REAL_CLI_DIR || DEFAULT_CLI_DIR;

if (!fs.existsSync(cliDir)) {
  console.error(
    `mockymock CLI checkout not found at:\n  ${cliDir}\n\n` +
      'Set MOCKYMOCK_REAL_CLI_DIR to a mocky-mock checkout new enough to have the ' +
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
