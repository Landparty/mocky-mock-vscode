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
  supportsGenerateDataCommand,
  supportsMutateCommand,
  supportsGenerateCommand,
  describeTooOldCli,
  describeUnsupportedFeature,
  isBundledExecutable,
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

  it('returns daemon-down for a Linux stopped-daemon connect error whose errno text contains "no such file or directory"', async () => {
    // Regression test: this stderr also matches COMMAND_NOT_FOUND_PATTERN's
    // "no such file or directory", which used to misclassify an installed
    // Docker with a stopped daemon as not-installed and prompt the user to
    // install Docker Desktop instead of starting the daemon.
    const status = await checkDocker(
      fakeRunner({
        code: 1,
        stdout: '',
        stderr:
          'error during connect: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.24/info": ' +
          'dial unix /var/run/docker.sock: connect: no such file or directory',
      })
    );
    assert.strictEqual(status, 'daemon-down');
  });

  it('returns daemon-down for the Windows named-pipe connect error', async () => {
    const status = await checkDocker(
      fakeRunner({
        code: 1,
        stdout: '',
        stderr:
          'error during connect: open //./pipe/docker_engine: The system cannot find the file specified.',
      })
    );
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

describe('supportsGenerateDataCommand', () => {
  it('returns true when analyze gen-data --help exits 0', async () => {
    const ok = await supportsGenerateDataCommand(
      fakeRunner({
        code: 0,
        stdout: 'usage: cobol-parser gen-data [-h] [--rows N] [--seed N] file\n',
        stderr: '',
      }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI whose pinned cobolparser predates gen-data', async () => {
    const ok = await supportsGenerateDataCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "cobol-parser: error: argument command: invalid choice: 'gen-data'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('probes the exact analyze gen-data --help arguments', async () => {
    let capturedArgs: string[] | undefined;
    const run: CommandRunner = async (_cmd, args) => {
      capturedArgs = args;
      return { code: 0, stdout: '', stderr: '' };
    };
    await supportsGenerateDataCommand(run, 'mockymock');
    assert.deepStrictEqual(capturedArgs, ['analyze', 'gen-data', '--help']);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsGenerateDataCommand(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});

describe('supportsMutateCommand', () => {
  it('returns true when mutate --help lists --json-report', async () => {
    const ok = await supportsMutateCommand(
      fakeRunner({ code: 0, stdout: 'usage: mockymock mutate ...\n  --json-report PATH  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the subcommand (argparse invalid choice, exit 2)', async () => {
    const ok = await supportsMutateCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "invalid choice: 'mutate'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsMutateCommand(
      fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }),
      'mockymock'
    );
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

  it('does not mistake a real CLI refusal about a missing copybook for "CLI not found"', () => {
    // Regression test: callers like paragraphTreeViewProvider.ts/
    // programFlowViewProvider.ts feed this function the REAL stderr of a
    // failed `mockymock analyze ...` invocation (not just a spawn-failure
    // sentinel) -- see ProgramFlowFetchError in programFlowClient.ts. A
    // Python FileNotFoundError for an unresolved copybook stringifies with
    // the exact errno text "No such file or directory", which used to
    // satisfy COMMAND_NOT_FOUND_PATTERN and replace this specific, actionable
    // refusal with a generic (and wrong) "CLI not found" message.
    const message = 'refused (unresolved-copybook): COPY ORDER.cpy not found';
    const stderr =
      "refused (unresolved-copybook): [Errno 2] No such file or directory: '/workspace/copybooks/ORDER.cpy'";
    assert.strictEqual(describeRefreshError(message, stderr), message);
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

  // darwinPathFallbackCandidates probes two ABSOLUTE host paths
  // (/opt/homebrew/bin/mockymock, /usr/local/bin/mockymock) that no
  // scratch-directory argument can redirect. A contributor's Mac -- or any
  // CI image that installs the real CLI to run integration checks -- has a
  // genuine binary at one of them, which used to make the "nothing is
  // installed" assertions below fail against the host's own filesystem
  // rather than against anything this suite set up. Confining the probe to
  // paths under tempDir keeps these cases hermetic while leaving the real
  // fs semantics intact for the fixtures each test actually creates.
  const sandboxedExists = (candidate: string): boolean =>
    candidate.startsWith(tempDir) && fs.existsSync(candidate);

  it('falls back to "mockymock" when the extension has no bin directory at all', () => {
    assert.strictEqual(
      resolveExecutablePath(undefined, path.join(tempDir, 'does-not-exist'), process.platform, os.homedir(), sandboxedExists),
      'mockymock'
    );
  });

  it('on darwin, falls back to "mockymock" (not a fake path) when no candidate exists either', () => {
    const noBinExtensionPath = path.join(tempDir, 'does-not-exist');
    const emptyHomeDir = path.join(tempDir, 'empty-home');
    fs.mkdirSync(emptyHomeDir);
    assert.strictEqual(
      resolveExecutablePath(undefined, noBinExtensionPath, 'darwin', emptyHomeDir, sandboxedExists),
      'mockymock'
    );
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

describe('supportsGenerateCommand', () => {
  it('returns true when generate --help lists --output', async () => {
    const ok = await supportsGenerateCommand(
      fakeRunner({ code: 0, stdout: 'usage: mockymock generate ...\n  -o OUTPUT, --output OUTPUT\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the subcommand (argparse invalid choice, exit 2)', async () => {
    const ok = await supportsGenerateCommand(
      fakeRunner({ code: 2, stdout: '', stderr: "invalid choice: 'generate'" }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsGenerateCommand(
      fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });
});

describe('isBundledExecutable', () => {
  const extensionPath = path.join('/ext', 'mockymock');

  it('recognizes the binary shipped inside the extension, on both platforms', () => {
    assert.strictEqual(isBundledExecutable(path.join(extensionPath, 'bin', 'mockymock'), extensionPath), true);
    assert.strictEqual(isBundledExecutable(path.join(extensionPath, 'bin', 'mockymock.exe'), extensionPath), true);
  });

  it('rejects a PATH lookup, a uv shim, and a user-configured path', () => {
    assert.strictEqual(isBundledExecutable('mockymock', extensionPath), false);
    assert.strictEqual(isBundledExecutable('/home/me/.local/bin/mockymock', extensionPath), false);
    assert.strictEqual(isBundledExecutable(path.join(extensionPath, 'mockymock'), extensionPath), false);
  });
});

describe('describeTooOldCli', () => {
  const extensionPath = path.join('/ext', 'mockymock');

  it('tells bundled-CLI users to update the extension, not "upgrade mockymock"', () => {
    const message = describeTooOldCli(path.join(extensionPath, 'bin', 'mockymock'), extensionPath, 'mutation testing');
    assert.ok(message.includes('bundled with this extension'), message);
    assert.ok(message.includes('mutation testing'), message);
    assert.ok(message.includes('Update the mockymock extension'), message);
    assert.ok(!message.includes('Upgrade mockymock'), message);
  });

  it('names the path and the setting for a non-bundled CLI', () => {
    const message = describeTooOldCli('/opt/homebrew/bin/mockymock', extensionPath, 'creating a test suite');
    assert.ok(message.includes('"/opt/homebrew/bin/mockymock"'), message);
    assert.ok(message.includes('creating a test suite'), message);
    assert.ok(message.includes('mockymock.executablePath'), message);
  });
});

describe('describeUnsupportedFeature', () => {
  const extensionPath = path.join('/ext', 'mockymock');

  it('reports "too old" when the CLI runs but lacks the feature', async () => {
    const message = await describeUnsupportedFeature(
      fakeRunner({ code: 0, stdout: 'mockymock 0.1.0', stderr: '' }),
      '/usr/local/bin/mockymock',
      extensionPath,
      'interactive debugging'
    );
    assert.ok(message.includes('too old to support interactive debugging'), message);
  });

  it('reports "not found" instead of "too old" when the CLI is missing entirely', async () => {
    const message = await describeUnsupportedFeature(
      fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }),
      'mockymock',
      extensionPath,
      'interactive debugging'
    );
    assert.strictEqual(message, CLI_NOT_FOUND_MESSAGE);
  });

  it('reports "permission denied" for a binary the OS refused to run', async () => {
    const message = await describeUnsupportedFeature(
      fakeRunner({ code: -1, stdout: '', stderr: 'permission denied' }),
      '/ext/bin/mockymock',
      extensionPath,
      'interactive debugging'
    );
    assert.strictEqual(message, CLI_PERMISSION_DENIED_MESSAGE);
  });
});
