import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  bundledBinaryName,
  checkCommandAvailable,
  checkDocker,
  darwinPathFallbackCandidates,
  resolveExecutablePath,
  getDockerDesktopLaunchCommand,
  describeDockerLaunchFailure,
  describeDockerStartFailure,
  supportsTraceFlag,
  supportsDebugCommand,
  supportsExportCommand,
  supportsAnalyzeCommand,
  describeRefreshError,
  CLI_NOT_FOUND_MESSAGE,
  CLI_PERMISSION_DENIED_MESSAGE,
  permissionDeniedMessageForPath,
} from './checks';
import { CommandResult, CommandRunner } from './commandRunner';

function fakeRunner(result: CommandResult): CommandRunner {
  return async () => result;
}

describe('checkCommandAvailable', () => {
  it('returns true when the command exits 0', async () => {
    const ok = await checkCommandAvailable(fakeRunner({ code: 0, stdout: '', stderr: '' }), 'mockymock', ['--version']);
    assert.strictEqual(ok, true);
  });

  it('returns false when the command exits non-zero', async () => {
    const ok = await checkCommandAvailable(fakeRunner({ code: 1, stdout: '', stderr: 'boom' }), 'mockymock', ['--version']);
    assert.strictEqual(ok, false);
  });
});

describe('checkDocker', () => {
  it('returns available when docker info exits 0', async () => {
    const status = await checkDocker(fakeRunner({ code: 0, stdout: 'ok', stderr: '' }));
    assert.strictEqual(status, 'available');
  });

  it('returns not-installed when the docker binary cannot be spawned', async () => {
    const status = await checkDocker(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }));
    assert.strictEqual(status, 'not-installed');
  });

  it('returns not-installed for a realistic Windows shell:true "not recognized" result', async () => {
    const status = await checkDocker(
      fakeRunner({
        code: 1,
        stdout: '',
        stderr: "'docker' is not recognized as an internal or external command,\r\noperable program or batch file.",
      })
    );
    assert.strictEqual(status, 'not-installed');
  });

  it('returns daemon-down when docker runs but the daemon is unreachable', async () => {
    const status = await checkDocker(fakeRunner({ code: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }));
    assert.strictEqual(status, 'daemon-down');
  });
});

describe('supportsTraceFlag', () => {
  it('returns true when --help lists --trace-json', async () => {
    const ok = await supportsTraceFlag(
      fakeRunner({ code: 0, stdout: 'usage: mockymock run ...\n  --trace-json PATH  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the flag', async () => {
    const ok = await supportsTraceFlag(
      fakeRunner({ code: 0, stdout: 'usage: mockymock run ...\n  --coverage-json PATH  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsTraceFlag(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});

describe('supportsDebugCommand', () => {
  it('returns true when debug --help lists --dap-stdio', async () => {
    const ok = await supportsDebugCommand(
      fakeRunner({ code: 0, stdout: 'usage: mockymock debug ...\n  --dap-stdio  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the debug subcommand', async () => {
    const ok = await supportsDebugCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "argument command: invalid choice: 'debug'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsDebugCommand(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});

describe('supportsExportCommand', () => {
  it('returns true when export --help lists --output', async () => {
    const ok = await supportsExportCommand(
      fakeRunner({ code: 0, stdout: 'usage: mockymock export ...\n  -o OUTPUT, --output OUTPUT  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the export subcommand', async () => {
    const ok = await supportsExportCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "argument command: invalid choice: 'export'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsExportCommand(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});

describe('supportsAnalyzeCommand', () => {
  it('returns true when analyze --help lists the COBOL_PARSER_ARGS passthrough', async () => {
    const ok = await supportsAnalyzeCommand(
      fakeRunner({
        code: 0,
        stdout: 'usage: mockymock analyze [-h] ...\n\npositional arguments:\n  COBOL_PARSER_ARGS  ...\n',
        stderr: '',
      }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the analyze subcommand', async () => {
    const ok = await supportsAnalyzeCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "argument command: invalid choice: 'analyze'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsAnalyzeCommand(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});

describe('describeRefreshError', () => {
  it('maps the exact ENOENT sentinel to the actionable CLI-not-found message', () => {
    // The precise shape commandRunner.ts produces when spawn() can't find
    // the executable, carried through unchanged onto BundleError.stderr.
    assert.strictEqual(describeRefreshError('command not found', 'command not found'), CLI_NOT_FOUND_MESSAGE);
  });

  it('maps a realistic Windows shell:true "not recognized" stderr the same way', () => {
    assert.strictEqual(
      describeRefreshError(
        "'mockymock' is not recognized as an internal or external command,\r\noperable program or batch file.",
        "'mockymock' is not recognized as an internal or external command,\r\noperable program or batch file."
      ),
      CLI_NOT_FOUND_MESSAGE
    );
  });

  it('leaves an unrelated failure message untouched', () => {
    assert.strictEqual(
      describeRefreshError('refused (unresolved-copybook): COPY ORDER-CPY not found', 'some other stderr'),
      'refused (unresolved-copybook): COPY ORDER-CPY not found'
    );
  });

  it('leaves the message untouched when stderr is undefined', () => {
    assert.strictEqual(describeRefreshError('bundle_version 2 is not supported', undefined), 'bundle_version 2 is not supported');
  });

  it('maps commandRunner\'s EACCES sentinel to the permission-denied message, not the not-found one', () => {
    assert.strictEqual(describeRefreshError('permission denied', 'permission denied'), CLI_PERMISSION_DENIED_MESSAGE);
  });
});

describe('permissionDeniedMessageForPath', () => {
  it('includes the exact executable path and the xattr fix command', () => {
    const message = permissionDeniedMessageForPath('/Applications/foo/bin/mockymock');
    assert.match(message, /\/Applications\/foo\/bin\/mockymock/);
    assert.match(message, /xattr -d com\.apple\.quarantine/);
  });
});

describe('bundledBinaryName', () => {
  it('returns mockymock.exe on win32', () => {
    assert.strictEqual(bundledBinaryName('win32'), 'mockymock.exe');
  });

  it('returns mockymock on non-win32 platforms', () => {
    assert.strictEqual(bundledBinaryName('linux'), 'mockymock');
    assert.strictEqual(bundledBinaryName('darwin'), 'mockymock');
  });
});

describe('resolveExecutablePath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-checks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns "mockymock" when unconfigured and no bundled binary exists', () => {
    assert.strictEqual(resolveExecutablePath(undefined, tempDir), 'mockymock');
    assert.strictEqual(resolveExecutablePath('', tempDir), 'mockymock');
    assert.strictEqual(resolveExecutablePath('   ', tempDir), 'mockymock');
  });

  it('returns the configured path when set, even if a bundled binary exists', () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'mockymock.exe' : 'mockymock'), '');
    assert.strictEqual(resolveExecutablePath('/opt/mockymock/bin/mockymock', tempDir), '/opt/mockymock/bin/mockymock');
  });

  it('returns the bundled binary path when present and nothing is configured', () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    const bundledName = process.platform === 'win32' ? 'mockymock.exe' : 'mockymock';
    fs.writeFileSync(path.join(binDir, bundledName), '');
    assert.strictEqual(resolveExecutablePath(undefined, tempDir), path.join(binDir, bundledName));
  });

  it('falls back to "mockymock" when the extension has no bin directory at all', () => {
    assert.strictEqual(resolveExecutablePath(undefined, path.join(tempDir, 'does-not-exist')), 'mockymock');
  });

  it('on darwin, falls back to "mockymock" (not a fake path) when no candidate exists either', () => {
    const noBinExtensionPath = path.join(tempDir, 'does-not-exist');
    const emptyHomeDir = path.join(tempDir, 'empty-home');
    fs.mkdirSync(emptyHomeDir);
    assert.strictEqual(resolveExecutablePath(undefined, noBinExtensionPath, 'darwin', emptyHomeDir), 'mockymock');
  });

  it('on darwin, finds a uv-installed CLI under ~/.local/bin when no bundled binary exists', () => {
    const noBinExtensionPath = path.join(tempDir, 'does-not-exist');
    const fakeHomeDir = path.join(tempDir, 'home');
    const localBinDir = path.join(fakeHomeDir, '.local', 'bin');
    fs.mkdirSync(localBinDir, { recursive: true });
    fs.writeFileSync(path.join(localBinDir, 'mockymock'), '');
    assert.strictEqual(
      // darwinPathFallbackCandidates joins with path.posix (these are macOS
      // paths by definition -- see its own comment), so the expected value
      // must be built the same way rather than with the host OS's path.join.
      resolveExecutablePath(undefined, noBinExtensionPath, 'darwin', fakeHomeDir),
      path.posix.join(fakeHomeDir, '.local', 'bin', 'mockymock')
    );
  });

  it('on darwin, a bundled binary still wins over the ~/.local/bin fallback', () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, 'mockymock'), '');
    const fakeHomeDir = path.join(tempDir, 'home');
    const localBinDir = path.join(fakeHomeDir, '.local', 'bin');
    fs.mkdirSync(localBinDir, { recursive: true });
    fs.writeFileSync(path.join(localBinDir, 'mockymock'), '');
    assert.strictEqual(resolveExecutablePath(undefined, tempDir, 'darwin', fakeHomeDir), path.join(binDir, 'mockymock'));
  });

  it('does not apply the darwin PATH fallback on win32/linux', () => {
    const noBinExtensionPath = path.join(tempDir, 'does-not-exist');
    const fakeHomeDir = path.join(tempDir, 'home');
    const localBinDir = path.join(fakeHomeDir, '.local', 'bin');
    fs.mkdirSync(localBinDir, { recursive: true });
    fs.writeFileSync(path.join(localBinDir, 'mockymock'), '');
    assert.strictEqual(resolveExecutablePath(undefined, noBinExtensionPath, 'linux', fakeHomeDir), 'mockymock');
    assert.strictEqual(resolveExecutablePath(undefined, noBinExtensionPath, 'win32', fakeHomeDir), 'mockymock');
  });
});

describe('darwinPathFallbackCandidates', () => {
  it('lists ~/.local/bin ahead of the Homebrew locations', () => {
    assert.deepStrictEqual(darwinPathFallbackCandidates('/Users/sam'), [
      '/Users/sam/.local/bin/mockymock',
      '/opt/homebrew/bin/mockymock',
      '/usr/local/bin/mockymock',
    ]);
  });
});


describe('describeDockerLaunchFailure', () => {
  it('returns undefined when the launch command exited 0', () => {
    const message = describeDockerLaunchFailure({ code: 0, stdout: '', stderr: '' });
    assert.strictEqual(message, undefined);
  });

  it('surfaces stderr from a failed launch (the cmd.exe double-quoting bug case)', () => {
    const message = describeDockerLaunchFailure({
      code: 1,
      stdout: '',
      stderr: 'The filename, directory name, or volume label syntax is incorrect.',
    });
    assert.match(message!, /The filename, directory name, or volume label syntax is incorrect\./);
  });

  it('falls back to stdout when stderr is empty', () => {
    const message = describeDockerLaunchFailure({ code: 1, stdout: 'some stdout detail', stderr: '' });
    assert.match(message!, /some stdout detail/);
  });

  it('falls back to the exit code when neither stream has content', () => {
    const message = describeDockerLaunchFailure({ code: 1, stdout: '', stderr: '' });
    assert.match(message!, /exit code 1/);
  });
});

describe('describeDockerStartFailure', () => {
  it('returns the generic timeout message when there is no launch error', () => {
    assert.strictEqual(
      describeDockerStartFailure(undefined),
      'Docker Desktop did not become ready within the timeout. Start it manually and try again.'
    );
  });

  it('prefers the specific launch error over the generic timeout message', () => {
    const message = describeDockerStartFailure('Failed to launch Docker Desktop: exit code 1');
    assert.match(message, /^Failed to launch Docker Desktop: exit code 1\. Start Docker Desktop manually/);
  });

  it('does not double punctuation when the launch error already ends with one', () => {
    const message = describeDockerStartFailure(
      'Failed to launch Docker Desktop: The filename, directory name, or volume label syntax is incorrect.'
    );
    assert.ok(!message.includes('..'), `expected no doubled punctuation, got ${message}`);
    assert.match(message, /incorrect\. Start Docker Desktop manually and try again\.$/);
  });
});

describe('getDockerDesktopLaunchCommand', () => {
  it('returns a win32 launch command', () => {
    const launch = getDockerDesktopLaunchCommand('win32');
    assert.ok(launch);
    assert.match(launch!.command, /Docker Desktop\.exe/);
  });

  it('does not pre-quote the win32 path, since commandRunner.quoteArgForWindowsShell already quotes any command containing a space', () => {
    // Regression test: a pre-quoted command here gets double-quoted by
    // commandRunner (it quotes any arg matching /[\s"]/, and a pre-quoted
    // string matches on both the space AND the embedded quote chars),
    // which cmd.exe then rejects with "The filename, directory name, or
    // volume label syntax is incorrect." -- silently breaking Docker
    // Desktop auto-launch on Windows until the 90s timeout in
    // environmentManager's startDockerDesktopAndWait gives up.
    const launch = getDockerDesktopLaunchCommand('win32');
    assert.ok(launch);
    assert.ok(!launch!.command.includes('"'), `expected an unquoted path, got ${launch!.command}`);
  });

  it('returns a darwin launch command', () => {
    assert.deepStrictEqual(getDockerDesktopLaunchCommand('darwin'), { command: 'open', args: ['-a', 'Docker'] });
  });

  it('returns null for an unsupported platform', () => {
    assert.strictEqual(getDockerDesktopLaunchCommand('aix' as NodeJS.Platform), null);
  });
});
