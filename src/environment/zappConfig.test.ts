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
});
