import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { healBundledBinaryOnDarwin } from './macSelfHeal';

describe('healBundledBinaryOnDarwin', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-macselfheal-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('is a no-op on non-darwin platforms, even with a bundled binary present', async () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    const binPath = path.join(binDir, 'mockymock');
    fs.writeFileSync(binPath, '');
    const before = fs.statSync(binPath).mode;

    await healBundledBinaryOnDarwin(tempDir, 'win32');
    await healBundledBinaryOnDarwin(tempDir, 'linux');

    assert.strictEqual(fs.statSync(binPath).mode, before);
  });

  it('is a no-op on darwin when there is no bundled binary at all', async () => {
    // Just asserting this resolves without throwing -- there is nothing to
    // observe (no bin/ directory was ever created).
    await healBundledBinaryOnDarwin(path.join(tempDir, 'does-not-exist'), 'darwin');
  });

  it('never throws on darwin even though /usr/bin/xattr does not exist on this (non-mac) test machine', async () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, 'mockymock'), '');

    await healBundledBinaryOnDarwin(tempDir, 'darwin');
  });
});
