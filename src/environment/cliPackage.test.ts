import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MOCKYMOCK_CLI_VERSION, MOCKYMOCK_PYPI_PACKAGE, mockymockInstallRequirement } from './cliPackage';

describe('mockymock CLI package pin', () => {
  it('installs a PyPI release, never a git URL', () => {
    assert.strictEqual(mockymockInstallRequirement(), `mockymock>=${MOCKYMOCK_CLI_VERSION}`);
    assert.ok(!mockymockInstallRequirement().includes('git+'));
  });

  // The workflows can't import this module, so they repeat the version as
  // their default. A bump that misses one of them would test or bundle a
  // different CLI than the one the extension asks users to install.
  for (const workflow of ['ci.yml', 'build-and-release.yml']) {
    it(`${workflow} defaults to the same CLI version`, () => {
      const text = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', workflow), 'utf8');
      const match = text.match(/MOCKYMOCK_VERSION:\s*\$\{\{\s*[^}]*\|\|\s*'([^']+)'\s*\}\}/);
      assert.ok(match, `${workflow} has no MOCKYMOCK_VERSION default`);
      assert.strictEqual(match[1], MOCKYMOCK_CLI_VERSION);
      assert.ok(text.includes(`${MOCKYMOCK_PYPI_PACKAGE}==`), `${workflow} does not install ${MOCKYMOCK_PYPI_PACKAGE} from PyPI`);
    });
  }
});
