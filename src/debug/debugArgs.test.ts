import * as assert from 'assert';
import * as path from 'path';
import { absolutizeDebugPaths, buildDebugArgs, debugAdapterCwd, buildLintArgs, MockymockDebugConfiguration } from './debugArgs';

describe('buildDebugArgs', () => {
  it('builds the debug --dap-stdio argv for a config with no copybook paths', () => {
    const config: MockymockDebugConfiguration = {
      program: '/ws/ACCTPRG.cbl',
      cut: '/ws/ACCTPRG.cut',
      case: 'posts a credit',
    };

    assert.deepStrictEqual(buildDebugArgs(config), [
      'debug',
      '/ws/ACCTPRG.cbl',
      '--cut',
      '/ws/ACCTPRG.cut',
      '--case',
      'posts a credit',
      '--dap-stdio',
    ]);
  });

  it('always includes --dap-stdio even if the caller omits it from config', () => {
    const config: MockymockDebugConfiguration = { program: 'P.cbl', cut: 'P.cut', case: 'a' };
    assert.ok(buildDebugArgs(config).includes('--dap-stdio'));
  });

  it('appends one --copybook-path flag per configured directory, in order', () => {
    const config: MockymockDebugConfiguration = {
      program: 'P.cbl',
      cut: 'P.cut',
      case: 'a',
      copybookPaths: ['/ws/copybooks', '/ws/shared/copybooks'],
    };

    assert.deepStrictEqual(buildDebugArgs(config), [
      'debug',
      'P.cbl',
      '--cut',
      'P.cut',
      '--case',
      'a',
      '--dap-stdio',
      '--copybook-path',
      '/ws/copybooks',
      '--copybook-path',
      '/ws/shared/copybooks',
    ]);
  });
});

describe('buildLintArgs', () => {
  it('builds the lint argv for a program/cut pair with no copybook paths', () => {
    assert.deepStrictEqual(buildLintArgs({ program: '/ws/ACCTPRG.cbl', cut: '/ws/ACCTPRG.cut' }), [
      'lint',
      '/ws/ACCTPRG.cbl',
      '--cut',
      '/ws/ACCTPRG.cut',
    ]);
  });

  it('appends one --copybook-path flag per configured directory, in order', () => {
    assert.deepStrictEqual(
      buildLintArgs({
        program: 'P.cbl',
        cut: 'P.cut',
        copybookPaths: ['/ws/copybooks', '/ws/shared/copybooks'],
      }),
      ['lint', 'P.cbl', '--cut', 'P.cut', '--copybook-path', '/ws/copybooks', '--copybook-path', '/ws/shared/copybooks']
    );
  });
});

describe('absolutizeDebugPaths', () => {
  it('anchors relative program and cut paths to the workspace folder', () => {
    const resolved = absolutizeDebugPaths({ program: 'src/P.cbl', cut: 'test/P.cut', case: 'a' }, '/ws');
    assert.strictEqual(resolved.program, path.resolve('/ws', 'src/P.cbl'));
    assert.strictEqual(resolved.cut, path.resolve('/ws', 'test/P.cut'));
    assert.strictEqual(resolved.case, 'a');
  });

  it('leaves absolute paths alone', () => {
    const abs = path.resolve('/ws/P.cbl');
    const resolved = absolutizeDebugPaths({ program: abs, cut: abs }, '/elsewhere');
    assert.strictEqual(resolved.program, abs);
    assert.strictEqual(resolved.cut, abs);
  });

  it('anchors relative copybook paths to the same workspace folder', () => {
    const abs = path.resolve('/shared/cpy');
    const resolved = absolutizeDebugPaths(
      { program: 'src/P.cbl', cut: 'test/P.cut', copybookPaths: ['copybooks', abs] },
      '/ws'
    );
    assert.deepStrictEqual(resolved.copybookPaths, [path.resolve('/ws', 'copybooks'), abs]);
  });

  it('is a no-op with no workspace folder to anchor to', () => {
    const config = { program: 'P.cbl', cut: 'P.cut' };
    assert.deepStrictEqual(absolutizeDebugPaths(config, undefined), config);
  });
});

describe('debugAdapterCwd', () => {
  it("is the .cut's folder for an absolute cut path", () => {
    const cut = path.resolve('/ws/test/P.cut');
    assert.strictEqual(debugAdapterCwd({ cut }), path.dirname(cut));
  });

  it('is undefined for a still-relative cut, so relative paths keep their base', () => {
    assert.strictEqual(debugAdapterCwd({ cut: 'tests/P.cut' }), undefined);
  });
});
