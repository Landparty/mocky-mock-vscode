import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveZappCopybookPaths } from './zappConfig';

describe('resolveZappCopybookPaths', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-zapp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an empty array when no zapp.yml or zapp.yaml exists', () => {
    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), []);
  });

  it('resolves a literal local cobol library location relative to the workspace root', () => {
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "COPYBOOK"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);
  });

  it('expands a glob-pattern local location to its matching directories', () => {
    fs.mkdirSync(path.join(tempDir, 'src', 'COPYBOOK'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'test', 'COPYBOOK'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "**/COPYBOOK"',
      ].join('\n')
    );

    const result = resolveZappCopybookPaths(tempDir).sort();
    assert.deepStrictEqual(result, [path.join(tempDir, 'src', 'COPYBOOK'), path.join(tempDir, 'test', 'COPYBOOK')].sort());
  });

  it('ignores mvs-type libraries and non-cobol language groups', () => {
    fs.mkdirSync(path.join(tempDir, 'COPYBOOK'));
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "COPYBOOK"',
        '      - name: syslib',
        '        type: mvs',
        '        locations:',
        '          - "HLQ.SAMPLE.COPY"',
        '  - name: jcl-includes',
        '    language: jcl',
        '    libraries:',
        '      - name: proclib',
        '        type: local',
        '        locations:',
        '          - "JCLPROC"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);
  });

  it('falls back to zapp.yaml when zapp.yml is absent', () => {
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yaml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "COPYBOOK"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);
  });

  it('returns an empty array instead of throwing when zapp.yml is malformed', () => {
    fs.writeFileSync(path.join(tempDir, 'zapp.yml'), 'propertyGroups: [this is not: valid: yaml');
    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), []);
  });

  it('returns an empty array instead of throwing when zapp.yml parses but propertyGroups has the wrong shape', () => {
    fs.writeFileSync(path.join(tempDir, 'zapp.yml'), 'propertyGroups: "not an array"');
    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), []);
  });

  it('matches language and type case-insensitively', () => {
    fs.mkdirSync(path.join(tempDir, 'COPYBOOK'));
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: COBOL',
        '    libraries:',
        '      - name: syslib',
        '        type: Local',
        '        locations:',
        '          - "COPYBOOK"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);
  });

  it('normalizes backslash-separated glob patterns before matching', () => {
    fs.mkdirSync(path.join(tempDir, 'libraries', 'cobol', 'SOMEDIR'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "libraries\\\\cobol\\\\*"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'libraries', 'cobol', 'SOMEDIR')]);
  });

  it('caches the result for an unchanged zapp.yml instead of re-globbing on every call', () => {
    fs.mkdirSync(path.join(tempDir, 'COPYBOOK'));
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "*"',
      ].join('\n')
    );

    const first = resolveZappCopybookPaths(tempDir);
    assert.deepStrictEqual(first, [path.join(tempDir, 'COPYBOOK')]);

    fs.rmSync(path.join(tempDir, 'COPYBOOK'), { recursive: true, force: true });
    const second = resolveZappCopybookPaths(tempDir);
    assert.deepStrictEqual(second, first, 'expected the cached result, not a fresh glob walk that would now find nothing');
  });

  it('invalidates the cache once zapp.yml is modified', () => {
    fs.mkdirSync(path.join(tempDir, 'COPYBOOK'));
    fs.mkdirSync(path.join(tempDir, 'OTHER'));
    const zappPath = path.join(tempDir, 'zapp.yml');
    const zapp = (location: string) =>
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        `          - "${location}"`,
      ].join('\n');

    fs.writeFileSync(zappPath, zapp('COPYBOOK'));
    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);

    fs.writeFileSync(zappPath, zapp('OTHER'));
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(zappPath, future, future);
    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'OTHER')]);
  });

  it('excludes a single unreachable glob match instead of discarding every resolved path', () => {
    fs.mkdirSync(path.join(tempDir, 'COPYBOOK'));
    // A junction pointing at a nonexistent target reproduces a broken-symlink/
    // TOCTOU-style stat failure without needing elevated privileges on Windows.
    fs.symlinkSync(path.join(tempDir, 'does-not-exist'), path.join(tempDir, 'BROKEN'), 'junction');
    fs.writeFileSync(
      path.join(tempDir, 'zapp.yml'),
      [
        'propertyGroups:',
        '  - name: cobol-copybooks',
        '    language: cobol',
        '    libraries:',
        '      - name: syslib',
        '        type: local',
        '        locations:',
        '          - "*"',
      ].join('\n')
    );

    assert.deepStrictEqual(resolveZappCopybookPaths(tempDir), [path.join(tempDir, 'COPYBOOK')]);
  });
});
