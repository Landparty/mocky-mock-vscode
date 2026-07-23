import * as assert from 'assert';
import { buildDebugArgs, buildLintArgs, MockymockDebugConfiguration } from './debugArgs';

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
