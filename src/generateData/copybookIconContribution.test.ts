import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { COPYBOOK_ICON_CONTEXT_KEY } from './copybookDetection';

// package.json's contributes.menus["editor/title"] entry for
// mockymock.generateData must carry a `when` clause on
// COPYBOOK_ICON_CONTEXT_KEY -- generateData.ts's activateGenerateDataCommand
// is the only thing that ever sets that context key. Importing the constant
// (rather than hardcoding the literal here) is the point: a typo in either
// file would otherwise hide the icon permanently with no error anywhere,
// and a hardcoded copy in this test would just restate the typo instead of
// catching it.
interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}

interface Manifest {
  contributes: {
    menus?: {
      'editor/title'?: MenuContribution[];
    };
  };
}

const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

describe('package.json editor/title icon contribution', () => {
  it('gates mockymock.generateData on the copybook-icon context key', () => {
    const entries = manifest.contributes.menus?.['editor/title'] ?? [];
    const entry = entries.find((e) => e.command === 'mockymock.generateData');
    assert.ok(entry, 'expected contributes.menus["editor/title"] to list "mockymock.generateData"');
    assert.strictEqual(
      entry.when,
      COPYBOOK_ICON_CONTEXT_KEY,
      'expected "mockymock.generateData"\'s when clause to match the context key activateGenerateDataCommand sets'
    );
  });
});
