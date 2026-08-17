#!/usr/bin/env node
// scripts/install-local.js
//
// Builds a .vsix from the current working tree and installs it into VS
// Code, for testing local changes without going through the Marketplace.
// Equivalent to: npm install && npm run package && code --install-extension <vsix>
//
// vsce package (npm run package) already runs vscode:prepublish, which
// produces a fresh production build (check-types + esbuild --production)
// before packaging, so this script doesn't need a separate compile step.
//
// --local-deps additionally points the mockymock CLI this extension will
// shell out to at your local ../mocky-mock and ../cobol-parser checkouts
// instead of whatever's pinned in mocky-mock's pyproject.toml (a specific
// git commit -- see that file's dependency comment). See the wrapper-script
// section below for why this needs more than a plain editable install.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const withLocalDeps = process.argv.includes('--local-deps');

// npm/npx/uv ship as .cmd shims on Windows; spawning those requires shell:
// true since Node's CVE-2024-27980 fix (see run-integration-tests.js for
// the same note re: spawning .cmd directly).
function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: REPO_ROOT, shell: true });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, shell: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`Failed to run: ${command} ${args.join(' ')}`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  return result.stdout.trim();
}

// Points the extension's mockymock CLI at local sibling checkouts for
// dev/test iteration, instead of the git-commit-pinned cobolparser that
// `uv tool install git+https://github.com/Landparty/mocky-mock.git`
// (EnvironmentManager.installMockymock, see PUBLISHING.md) would fetch.
//
// `uv tool install --editable ../mocky-mock` alone is NOT enough: cobol-parser's
// pyproject.toml currently declares its distribution name as "cobol-parser"
// (renamed from "cobolparser" by a release-please sync -- see
// 0ba507c "fix: sync release-please package-name with pyproject.toml
// project name" in that repo), while mocky-mock's pyproject.toml still
// depends on the name "cobolparser". Confirmed empirically: `uv run
// --with-editable ../cobol-parser` installs the local checkout as an
// unused second package and still resolves `import cobolparser` from the
// git-pinned cached copy, because uv matches by declared distribution name,
// not by the importable module folder.
//
// Sidestepping that entirely: `import cobolparser` resolves by module name
// only, and Python's sys.path puts PYTHONPATH entries ahead of
// site-packages. So instead of fighting uv's resolver, this installs
// mocky-mock editable (for its own code) and generates a wrapper script
// that sets PYTHONPATH to the local cobol-parser checkout root before
// invoking the real mockymock shim -- shadowing the pinned copy with your
// local one on every run, no reinstall needed as you edit cobol-parser.
function installLocalDeps() {
  const mockyMockDir = process.env.MOCKYMOCK_LOCAL_DIR || path.resolve(REPO_ROOT, '..', 'mocky-mock');
  const cobolParserDir = process.env.COBOL_PARSER_LOCAL_DIR || path.resolve(REPO_ROOT, '..', 'cobol-parser');

  for (const [label, dir] of [['mocky-mock', mockyMockDir], ['cobol-parser', cobolParserDir]]) {
    if (!fs.existsSync(path.join(dir, 'pyproject.toml'))) {
      console.error(
        `${label} checkout not found at ${dir} (no pyproject.toml).\n` +
          `Set MOCKYMOCK_LOCAL_DIR / COBOL_PARSER_LOCAL_DIR if your checkouts live somewhere else.`
      );
      process.exit(1);
    }
  }

  const uvCheck = spawnSync('uv', ['--version'], { shell: true });
  if (uvCheck.error || uvCheck.status !== 0) {
    console.error('uv not found on PATH. Install it: https://docs.astral.sh/uv/getting-started/installation/');
    process.exit(1);
  }

  run('uv', ['tool', 'install', '--editable', mockyMockDir, '--force']);

  const toolBinDir = runCapture('uv', ['tool', 'dir', '--bin']);
  const shimPath = path.join(toolBinDir, process.platform === 'win32' ? 'mockymock.exe' : 'mockymock');
  if (!fs.existsSync(shimPath)) {
    console.error(`Expected uv to install a mockymock shim at ${shimPath}, but it's not there.`);
    process.exit(1);
  }

  const wrapperDir = path.join(REPO_ROOT, 'scripts', '.local');
  fs.mkdirSync(wrapperDir, { recursive: true });

  let wrapperPath;
  if (process.platform === 'win32') {
    wrapperPath = path.join(wrapperDir, 'mockymock-dev.cmd');
    fs.writeFileSync(
      wrapperPath,
      `@echo off\r\nset "PYTHONPATH=${cobolParserDir};%PYTHONPATH%"\r\n"${shimPath}" %*\r\nexit /b %ERRORLEVEL%\r\n`
    );
  } else {
    wrapperPath = path.join(wrapperDir, 'mockymock-dev.sh');
    fs.writeFileSync(
      wrapperPath,
      `#!/usr/bin/env bash\nexport PYTHONPATH="${cobolParserDir}:$PYTHONPATH"\nexec "${shimPath}" "$@"\n`
    );
    fs.chmodSync(wrapperPath, 0o755);
  }

  console.log(
    `\nWrapper written to ${wrapperPath}\n` +
      `It runs mocky-mock editable from ${mockyMockDir} with cobolparser shadowed by ${cobolParserDir}.\n\n` +
      `In the workspace where you open .cut files to test, set in .vscode/settings.json:\n` +
      `  "mockymock.executablePath": ${JSON.stringify(wrapperPath)}\n` +
      `Re-run this script (or "uv tool install --editable" for mocky-mock) whenever cobol-parser or mocky-mock's own dependencies change.`
  );
}

if (withLocalDeps) {
  installLocalDeps();
}

run('npm', ['install']);
run('npm', ['run', 'package']);

const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(REPO_ROOT, vsixName);

if (!fs.existsSync(vsixPath)) {
  console.error(`Expected vsce to produce ${vsixName}, but it's not at ${vsixPath}.`);
  process.exit(1);
}

run('code', ['--install-extension', vsixPath, '--force']);

console.log(`\nInstalled ${vsixName} into VS Code. Reload/restart VS Code to pick up the new version.`);
