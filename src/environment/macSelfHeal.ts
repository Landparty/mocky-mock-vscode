// src/environment/macSelfHeal.ts
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from './commandRunner';

// macOS Gatekeeper blocks execution of a quarantined, unsigned binary (the
// com.apple.quarantine extended attribute, set on files downloaded via a
// browser) unless it's signed with a paid Apple Developer Program cert and
// notarized -- which the bundled `mockymock` binary is not (see README).
// Since the extension already has the binary sitting in its own install
// directory, it can clear the flag itself before anything ever tries to run
// it, with no action required from the user. This is best-effort and silent
// by design -- it must never block or fail activation. If it doesn't work
// (e.g. a locked-down install location), checks.ts's
// CLI_PERMISSION_DENIED_MESSAGE is the fallback, with a manual command.
export async function healBundledBinaryOnDarwin(
  extensionPath: string,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (platform !== 'darwin') {
    return;
  }
  const binPath = path.join(extensionPath, 'bin', 'mockymock');
  if (!fs.existsSync(binPath)) {
    return; // no bundled binary in this install (e.g. running from source)
  }
  await Promise.allSettled([
    fs.promises.chmod(binPath, 0o755),
    // xattr exits non-zero when the attribute is already absent -- the
    // common case on every activation after the first -- which is not an
    // error worth surfacing; runCommand resolving with a non-zero code
    // rather than throwing is exactly what we want here.
    runCommand('/usr/bin/xattr', ['-d', 'com.apple.quarantine', binPath]),
  ]);
}
