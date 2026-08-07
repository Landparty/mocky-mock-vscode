import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  bundledBinaryName,
  checkCommandAvailable,
  checkDocker,
  resolveExecutablePath,
  resolveReleaseAssetName,
  getDockerDesktopLaunchCommand,
  supportsTraceFlag,
  supportsDebugCommand,
  supportsExportCommand,
  supportsAnalyzeCommand,
  describeRefreshError,
  CLI_NOT_FOUND_MESSAGE,
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
});

describe('resolveReleaseAssetName', () => {
  it('maps linux x64 to the linux release asset', () => {
    assert.strictEqual(resolveReleaseAssetName('linux', 'x64'), 'mockymock-linux-x86_64');
  });

  it('maps darwin arm64 to the macOS release asset', () => {
    assert.strictEqual(resolveReleaseAssetName('darwin', 'arm64'), 'mockymock-macos-arm64');
  });

  it('maps win32 x64 to the Windows release asset', () => {
    assert.strictEqual(resolveReleaseAssetName('win32', 'x64'), 'mockymock-windows-amd64.exe');
  });

  it('returns null for a combination the release workflow does not build (e.g. Intel Mac)', () => {
    assert.strictEqual(resolveReleaseAssetName('darwin', 'x64'), null);
  });

  it('returns null for an unsupported platform', () => {
    assert.strictEqual(resolveReleaseAssetName('aix' as NodeJS.Platform, 'x64'), null);
  });
});

describe('getDockerDesktopLaunchCommand', () => {
  it('returns a win32 launch command', () => {
    const launch = getDockerDesktopLaunchCommand('win32');
    assert.ok(launch);
    assert.match(launch!.command, /Docker Desktop\.exe/);
  });

  it('returns a darwin launch command', () => {
    assert.deepStrictEqual(getDockerDesktopLaunchCommand('darwin'), { command: 'open', args: ['-a', 'Docker'] });
  });

  it('returns null for an unsupported platform', () => {
    assert.strictEqual(getDockerDesktopLaunchCommand('aix' as NodeJS.Platform), null);
  });
});
