import * as assert from 'assert';
import {
  checkCommandAvailable,
  checkDocker,
  resolveExecutablePath,
  resolveReleaseAssetName,
  getDockerDesktopLaunchCommand,
  supportsTraceFlag,
  supportsDebugCommand,
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

describe('resolveExecutablePath', () => {
  it('returns "mockymock" when unconfigured', () => {
    assert.strictEqual(resolveExecutablePath(undefined), 'mockymock');
    assert.strictEqual(resolveExecutablePath(''), 'mockymock');
    assert.strictEqual(resolveExecutablePath('   '), 'mockymock');
  });

  it('returns the configured path when set', () => {
    assert.strictEqual(resolveExecutablePath('/opt/mockymock/bin/mockymock'), '/opt/mockymock/bin/mockymock');
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
