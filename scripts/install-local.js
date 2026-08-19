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
// section below for why this needs more than a plain editable install. It
// also rebuilds cobol-parser's Cython-accelerated hot-path modules in place,
// so edits to any .pyx file are picked up too -- see
// rebuildCobolParserExtensions below for why that can't be skipped.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const withLocalDeps = process.argv.includes('--local-deps');

// npm/npx/uv ship as .cmd shims on Windows; spawning those requires shell:
// true since Node's CVE-2024-27980 fix. shell:true only on win32 -- on POSIX
// these are real executables and spawn() can invoke them directly, args array
// intact, with no shell re-parsing (and therefore no quoting needed).
const useShell = process.platform === 'win32';

// Mirrors src/environment/commandRunner.ts's quoteArgForWindowsShell: with
// shell:true, Node hands args to cmd.exe by joining them into one string
// with NO quoting of its own, so a path/arg containing a space, a double
// quote, or a cmd.exe metacharacter (`& | ^ < > ( )`) gets split or
// reinterpreted before the target command ever sees it. Only apply this
// when shell is actually true -- with shell:false the args array reaches
// the OS unmodified, and quoting there would corrupt it instead of
// protecting it.
const CMD_NEEDS_QUOTING = /[\s"&|<>^()]/;
function quoteArgForWindowsShell(arg) {
  if (arg.length === 0) {
    return '""';
  }
  if (CMD_NEEDS_QUOTING.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

function run(command, args, cwd = REPO_ROOT) {
  console.log(`> ${command} ${args.join(' ')}`);
  const spawnCommand = useShell ? quoteArgForWindowsShell(command) : command;
  const spawnArgs = useShell ? args.map(quoteArgForWindowsShell) : args;
  const result = spawnSync(spawnCommand, spawnArgs, { stdio: 'inherit', cwd, shell: useShell });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function runCapture(command, args) {
  const spawnCommand = useShell ? quoteArgForWindowsShell(command) : command;
  const spawnArgs = useShell ? args.map(quoteArgForWindowsShell) : args;
  const result = spawnSync(spawnCommand, spawnArgs, { cwd: REPO_ROOT, shell: useShell, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`Failed to run: ${command} ${args.join(' ')}`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  return result.stdout.trim();
}

// cobol-parser's lexer/preprocessor/data-item hot paths have an optional
// Cython-compiled twin (_lexer_fast/_preprocess_fast/_data_fast) that, once
// built, takes priority over the pure-Python implementation at import time.
// The PYTHONPATH wrapper set up below shadows cobolparser with this local
// checkout, but that only shadows the .py source -- if a .pyd from an
// earlier build (or none at all) is sitting in cobolParserDir, edits to the
// corresponding .pyx file silently have no effect until it's rebuilt. So
// this rebuilds it in place on every --local-deps run rather than assuming
// it's current.
//
// toolPythonPath MUST be the exact interpreter the mockymock tool venv runs
// on (resolved by the caller from that venv, after it exists), not whatever
// interpreter `uv run` would pick on its own: a compiled extension only
// loads under the same (major, minor, platform) ABI it was built for --
// Python silently no-ops a mismatched .pyd (find_spec returns None, no
// error), so cobolparser would fall back to pure Python with the script
// still reporting success. `uv run --python <path>` pins the build to that
// exact interpreter so the resulting ABI tag always matches.
//
// Uses `uv run` (already a hard requirement below) rather than a bare
// `python`: setup.py's build needs setuptools/wheel/cython, which aren't
// installed by default and shouldn't be assumed present globally.
// `--extra fast --with setuptools --with wheel` provisions an ephemeral venv
// with exactly those and nothing more, scoped to this one command -- it
// does not touch cobol-parser's own dev environment.
function rebuildCobolParserExtensions(cobolParserDir, toolPythonPath) {
  console.log(
    `\nRebuilding cobol-parser Cython extensions in ${cobolParserDir} ` +
      `(pinned to ${toolPythonPath}, the interpreter mockymock actually runs on)...`
  );
  run(
    'uv',
    [
      'run',
      '--python',
      toolPythonPath,
      '--extra',
      'fast',
      '--with',
      'setuptools',
      '--with',
      'wheel',
      '--',
      'python',
      'setup.py',
      'build_ext',
      '--inplace',
    ],
    cobolParserDir
  );
}

// Reads [project].name out of a pyproject.toml -- used to find the venv uv
// created for a `uv tool install`, since uv names that venv directory after
// the installed project's distribution name (e.g. "mocky-mock"), not the
// console-script/executable name it exposes (e.g. "mockymock"). Confirmed
// empirically: `uv tool dir` on this machine also has a stale "mockymock"
// venv (an old, non-editable install from before this repo's rename) sitting
// alongside the current "mocky-mock" one -- using the executable name here
// would resolve to the wrong, stale interpreter.
function readProjectName(pyprojectDir) {
  const text = fs.readFileSync(path.join(pyprojectDir, 'pyproject.toml'), 'utf8');
  const match = text.match(/^name\s*=\s*"([^"]+)"/m);
  if (!match) {
    console.error(`Could not read [project].name from ${path.join(pyprojectDir, 'pyproject.toml')}`);
    process.exit(1);
  }
  return match[1];
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

  const uvCheck = spawnSync(useShell ? quoteArgForWindowsShell('uv') : 'uv', ['--version'], { shell: useShell });
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

  const toolsRootDir = runCapture('uv', ['tool', 'dir']);
  const mockyMockProjectName = readProjectName(mockyMockDir);
  const toolPythonPath = path.join(
    toolsRootDir,
    mockyMockProjectName,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  );
  if (!fs.existsSync(toolPythonPath)) {
    console.error(`Expected the mocky-mock tool venv's Python at ${toolPythonPath}, but it's not there.`);
    process.exit(1);
  }

  rebuildCobolParserExtensions(cobolParserDir, toolPythonPath);

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
