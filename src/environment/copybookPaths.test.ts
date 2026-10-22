import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  copybookPathArgs,
  expandSettingPath,
  hasProjectConfig,
  planCopybookPaths,
  mergeCopybookPaths,
  resolveAgainstWorkspaceRoot,
  resolveCopybookPathSetting,
  resolveExecutablePathSetting,
} from './copybookPaths';

describe('mergeCopybookPaths', () => {
  it('puts primary (setting-derived) paths first, followed by secondary (zapp.yml-derived) paths', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/s/COPYBOOK'], ['/z/COPYBOOK']), ['/s/COPYBOOK', '/z/COPYBOOK']);
  });

  it('dedupes a path declared in both sources, keeping the primary one', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/shared/COPYBOOK'], ['/shared/COPYBOOK']), ['/shared/COPYBOOK']);
  });

  it('dedupes paths that differ only by a trailing separator', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/shared/COPYBOOK/'], ['/shared/COPYBOOK']), ['/shared/COPYBOOK/']);
  });

  it('dedupes case-differing paths on win32', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.deepStrictEqual(mergeCopybookPaths(['C:\\ws\\COPYBOOK'], ['C:\\ws\\copybook']), ['C:\\ws\\COPYBOOK']);
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform!);
    }
  });

  it('dedupes the same win32 absolute path in native-backslash and normalized-forward-slash form', () => {
    // Regression test: the mockymock.copybookPaths setting carries native
    // (backslash) separators on Windows, but a zapp.yml-derived absolute
    // path arrives forward-slash-normalized (zappConfig.ts's resolveLocation
    // normalizes for glob compatibility even on the literal-path branch).
    // The same directory declared through both sources used to produce two
    // different dedup keys and ship as a duplicate --copybook-path.
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.deepStrictEqual(
        mergeCopybookPaths(['C:\\mainframe\\syslib'], ['C:/mainframe/syslib']),
        ['C:\\mainframe\\syslib']
      );
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform!);
    }
  });
});

describe('resolveAgainstWorkspaceRoot', () => {
  it('joins a relative path against the root', () => {
    assert.strictEqual(resolveAgainstWorkspaceRoot('COPYBOOK', '/ws'), path.join('/ws', 'COPYBOOK'));
  });

  it('passes an absolute path through unchanged', () => {
    const absolute = path.resolve('/somewhere/COPYBOOK');
    assert.strictEqual(resolveAgainstWorkspaceRoot(absolute, '/ws'), absolute);
  });
});

describe('setting path expansion', () => {
  const ws = path.resolve('/ws/payroll');
  const shared = path.resolve('/ws/shared');
  const home = path.resolve('/home/sam');
  const ctx = { folder: ws, homeDir: home, namedFolder: (n: string) => (n === 'shared' ? shared : undefined) };

  it('expands ~, ${userHome}, ${workspaceFolder} and ${workspaceFolder:name}', () => {
    assert.strictEqual(expandSettingPath('~/.local/bin/mockymock', ctx), path.normalize(`${home}/.local/bin/mockymock`));
    assert.strictEqual(expandSettingPath('~', ctx), home);
    assert.strictEqual(expandSettingPath('${userHome}/cpy', ctx), path.normalize(`${home}/cpy`));
    assert.strictEqual(expandSettingPath('${workspaceFolder}/bin/mockymock', ctx), path.normalize(`${ws}/bin/mockymock`));
    assert.strictEqual(expandSettingPath('${workspaceFolder:shared}/cpy', ctx), path.normalize(`${shared}/cpy`));
  });

  it('leaves a variable with nothing to stand for, and a ~ inside a name, as written', () => {
    assert.strictEqual(expandSettingPath('${workspaceFolder}/cpy', { homeDir: home }), '${workspaceFolder}/cpy');
    assert.strictEqual(expandSettingPath('${workspaceFolder:other}/cpy', ctx), '${workspaceFolder:other}/cpy');
    assert.strictEqual(expandSettingPath('~sam/cpy', ctx), '~sam/cpy');
  });

  it('resolves a relative executable path against the workspace folder, not the host cwd', () => {
    assert.strictEqual(resolveExecutablePathSetting('.venv/bin/mockymock', ctx), path.resolve(ws, '.venv/bin/mockymock'));
    assert.strictEqual(resolveExecutablePathSetting('~/.local/bin/mockymock', ctx), path.resolve(home, '.local/bin/mockymock'));
  });

  it('keeps a bare executable name for a PATH lookup, and an unset one unset', () => {
    assert.strictEqual(resolveExecutablePathSetting('mockymock', ctx), 'mockymock');
    assert.strictEqual(resolveExecutablePathSetting('', ctx), '');
    assert.strictEqual(resolveExecutablePathSetting(undefined, ctx), undefined);
  });

  it('expands copybook entries before resolving relative ones under the folder', () => {
    assert.strictEqual(resolveCopybookPathSetting('${workspaceFolder}/copybooks', ctx), path.join(ws, 'copybooks'));
    assert.strictEqual(resolveCopybookPathSetting('~/copybooks', ctx), path.join(home, 'copybooks'));
    assert.strictEqual(resolveCopybookPathSetting('copybooks', ctx), path.join(ws, 'copybooks'));
  });
});

describe('planCopybookPaths (#130, #145)', () => {
  const base = { companion: [], zapp: [], hasProjectConfig: false, supportsExtraCopybookPath: true };

  it('keeps the explicit setting on --copybook-path and sends zapp.yml to --extra-copybook-path', () => {
    assert.deepStrictEqual(planCopybookPaths({ ...base, explicit: ['/own', '/shared'], zapp: ['/shared/', '/zapp'] }), {
      copybookPaths: ['/own', '/shared'],
      extraCopybookPaths: ['/zapp'],
    });
  });

  it('sends the companion setting and zapp.yml to --extra-copybook-path when nothing is explicit', () => {
    assert.deepStrictEqual(planCopybookPaths({ ...base, explicit: undefined, companion: ['/ca'], zapp: ['/zapp'] }), {
      copybookPaths: [],
      extraCopybookPaths: ['/ca', '/zapp'],
    });
  });

  it('treats an explicit [] as "no copybook paths from the extension", zapp.yml included', () => {
    for (const supportsExtraCopybookPath of [true, false]) {
      assert.deepStrictEqual(
        planCopybookPaths({ ...base, supportsExtraCopybookPath, explicit: [], companion: ['/ca'], zapp: ['/zapp'] }),
        { copybookPaths: [], extraCopybookPaths: [] }
      );
    }
  });

  describe('a CLI without --extra-copybook-path', () => {
    const old = { ...base, supportsExtraCopybookPath: false };

    it('gets one merged list, as before', () => {
      assert.deepStrictEqual(planCopybookPaths({ ...old, explicit: ['/own'], zapp: ['/zapp'] }), {
        copybookPaths: ['/own', '/zapp'],
        extraCopybookPaths: [],
      });
      assert.deepStrictEqual(planCopybookPaths({ ...old, explicit: undefined, companion: ['/ca'], zapp: ['/zapp'] }), {
        copybookPaths: ['/ca', '/zapp'],
        extraCopybookPaths: [],
      });
    });

    it('drops the zapp.yml locations when a project config would lose its list to them', () => {
      assert.deepStrictEqual(
        planCopybookPaths({ ...old, hasProjectConfig: true, explicit: undefined, zapp: ['/zapp'] }),
        { copybookPaths: [], extraCopybookPaths: [] }
      );
    });

    it('still passes an explicit setting, which replaces the config list by design', () => {
      assert.deepStrictEqual(
        planCopybookPaths({ ...old, hasProjectConfig: true, explicit: ['/own'], zapp: ['/zapp'] }),
        { copybookPaths: ['/own', '/zapp'], extraCopybookPaths: [] }
      );
    });
  });
});

describe('copybookPathArgs', () => {
  it('lists --copybook-path entries first, then --extra-copybook-path ones', () => {
    assert.deepStrictEqual(copybookPathArgs(['/a'], ['/b', '/c']), [
      '--copybook-path',
      '/a',
      '--extra-copybook-path',
      '/b',
      '--extra-copybook-path',
      '/c',
    ]);
  });
});

describe('hasProjectConfig', () => {
  let root: string;
  beforeEach(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-config-')));
    fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('finds a cobol.yml or mockymock.toml in a parent folder', () => {
    fs.writeFileSync(path.join(root, 'cobol.yml'), 'copybook_paths: [cpy]\n');
    assert.strictEqual(hasProjectConfig(path.join(root, 'src', 'deep')), true);
  });

  it('counts a pyproject.toml only with a [tool.mockymock] table', () => {
    fs.writeFileSync(path.join(root, 'src', 'pyproject.toml'), '[tool.black]\nline-length = 88\n');
    assert.strictEqual(hasProjectConfig(path.join(root, 'src', 'deep')), false);
    fs.writeFileSync(path.join(root, 'src', 'pyproject.toml'), '[tool.mockymock]\nseed = 7\n');
    assert.strictEqual(hasProjectConfig(path.join(root, 'src', 'deep')), true);
  });
});
