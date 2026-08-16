import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { COBOL_VIEWS_CONTEXT_KEY } from './viewRefreshPolicy';

// package.json's contributes.views.explorer entries for both side views must
// carry a `when` clause on COBOL_VIEWS_CONTEXT_KEY -- extension.ts's
// activateCobolViewVisibility is the only thing that ever sets that context
// key. Importing the constant (rather than hardcoding the literal here) is
// the point: a typo in either file would otherwise hide both views
// permanently with no error anywhere, and a hardcoded copy in this test
// would just restate the typo instead of catching it.
//
// Read rather than imported: tsconfig.json doesn't enable resolveJsonModule,
// and mocha runs from the repo root so cwd is stable here.
interface ViewContribution {
  id: string;
  when?: string;
}

interface Manifest {
  contributes: {
    views?: {
      explorer?: ViewContribution[];
    };
  };
}

const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

describe('package.json side-view visibility contribution', () => {
  const explorerViews = manifest.contributes.views?.explorer ?? [];

  for (const viewId of ['mockymock.paragraphTree']) {
    it(`gates ${viewId} on the shared COBOL-open context key`, () => {
      const view = explorerViews.find((entry) => entry.id === viewId);
      assert.ok(view, `expected contributes.views.explorer to list "${viewId}"`);
      assert.strictEqual(
        view.when,
        COBOL_VIEWS_CONTEXT_KEY,
        `expected "${viewId}"'s when clause to match the context key activateCobolViewVisibility sets`
      );
    });
  }
});
