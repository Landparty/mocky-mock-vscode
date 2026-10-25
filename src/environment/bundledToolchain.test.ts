import * as assert from 'assert';
import * as path from 'path';
import {
  applyToolchainEnvironment,
  bundledGnuCobolHome,
  cCompilerHint,
  chooseToolchain,
  HOME_ENV,
  nativeToolchainSelected,
  resetToolchainEnvironmentForTests,
  TOOLCHAIN_ENV,
  toolchainEnvironment,
} from './bundledToolchain';

const EXT = path.join('/ext', 'mockymock');
const BUNDLED = path.join(EXT, 'gnucobol');

describe('bundled GnuCOBOL toolchain', () => {
  beforeEach(() => resetToolchainEnvironmentForTests());

  it('finds the tree only when its cobc is there, with the platform suffix', () => {
    const seen: string[] = [];
    const exists = (p: string) => {
      seen.push(p);
      return p === path.join(BUNDLED, 'bin', 'cobc');
    };
    assert.strictEqual(bundledGnuCobolHome(EXT, 'linux', exists), BUNDLED);
    assert.strictEqual(bundledGnuCobolHome(EXT, 'win32', exists), undefined);
    assert.ok(seen.includes(path.join(BUNDLED, 'bin', 'cobc.exe')));
  });

  it('auto uses the bundled tree when there is one', () => {
    const choice = chooseToolchain('auto', BUNDLED, {});
    assert.strictEqual(choice.backend, 'native');
    assert.deepStrictEqual(choice.env, { [HOME_ENV]: BUNDLED, [TOOLCHAIN_ENV]: 'native' });
  });

  it('auto falls back to Docker without a tree', () => {
    assert.strictEqual(chooseToolchain(undefined, undefined, {}).backend, 'docker');
  });

  it('auto keeps a GnuCOBOL home the user exported over the bundled one', () => {
    const choice = chooseToolchain('auto', BUNDLED, { [HOME_ENV]: '/opt/my-gnucobol' });
    assert.strictEqual(choice.home, '/opt/my-gnucobol');
    assert.ok(!(HOME_ENV in choice.env));
  });

  it('bundled replaces an exported home with the bundled tree', () => {
    const choice = chooseToolchain('bundled', BUNDLED, { [HOME_ENV]: '/opt/my-gnucobol' });
    assert.strictEqual(choice.home, BUNDLED);
  });

  it('docker forces the container even with a tree', () => {
    const choice = chooseToolchain('docker', BUNDLED, {});
    assert.deepStrictEqual(choice, { backend: 'docker', env: { [TOOLCHAIN_ENV]: 'docker' } });
  });

  it('switching settings back restores what the user had exported', () => {
    const env: NodeJS.ProcessEnv = { [HOME_ENV]: '/opt/my-gnucobol' };
    applyToolchainEnvironment(EXT, 'docker', env);
    assert.strictEqual(env[TOOLCHAIN_ENV], 'docker');
    assert.strictEqual(nativeToolchainSelected(env), false);
    applyToolchainEnvironment(EXT, 'auto', env);
    assert.strictEqual(env[HOME_ENV], '/opt/my-gnucobol');
    assert.strictEqual(env[TOOLCHAIN_ENV], 'native');
    assert.strictEqual(nativeToolchainSelected(env), true);
    assert.deepStrictEqual(toolchainEnvironment(env), {
      [HOME_ENV]: '/opt/my-gnucobol',
      [TOOLCHAIN_ENV]: 'native',
    });
  });

  it('names the C compiler to install on each platform', () => {
    assert.match(cCompilerHint('darwin'), /xcode-select --install/);
    assert.match(cCompilerHint('linux'), /gcc/);
    assert.match(cCompilerHint('win32'), /reinstall/);
  });
});
