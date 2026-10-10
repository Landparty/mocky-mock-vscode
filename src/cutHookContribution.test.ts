import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// The .cut suite hooks (BEFORE-ALL / BEFORE-EACH / AFTER-EACH / AFTER-ALL,
// closed by END-BEFORE / END-AFTER) need highlighting, folding and a
// snippet each; mockymock's parser is the source of truth for the grammar
// (mocky-mock docs/2026-10-10-suite-hooks-design.md).
const repoRoot = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, p), 'utf8'));

const HOOKS = ['BEFORE-ALL', 'BEFORE-EACH', 'AFTER-EACH', 'AFTER-ALL'];
const END_OF = (hook: string) => (hook.startsWith('BEFORE') ? 'END-BEFORE' : 'END-AFTER');

interface Pattern {
  match?: string;
}

describe('.cut suite hook contributions', () => {
  const grammar = read('syntaxes/cut.tmLanguage.json');
  const patterns: Pattern[] = JSON.stringify(grammar).includes('"repository"')
    ? Object.values(grammar.repository as Record<string, { patterns?: Pattern[] }>).flatMap((r) => r.patterns ?? [])
    : [];
  const allPatterns = [...(grammar.patterns as Pattern[]), ...patterns];
  const matches = (line: string) =>
    allPatterns.some((p) => p.match !== undefined && new RegExp(p.match.replace(/\(\?i:/g, '(?:')).test(line));

  it('highlights every hook keyword and its terminator', () => {
    for (const hook of HOOKS) {
      assert.ok(matches(hook), `no grammar rule matches "${hook}"`);
      assert.ok(matches(`    ${END_OF(hook)}`), `no grammar rule matches "${END_OF(hook)}"`);
    }
  });

  it('folds every hook block', () => {
    const { start, end } = read('language/cut-language-configuration.json').folding.markers;
    for (const hook of HOOKS) {
      assert.ok(new RegExp(start).test(hook), `"${hook}" does not open a folding region`);
      assert.ok(new RegExp(end).test(END_OF(hook)), `"${END_OF(hook)}" does not close one`);
    }
  });

  it('offers a snippet for every hook, closed by the right terminator', () => {
    const snippets = Object.values(read('snippets/cut.code-snippets') as Record<string, { body: string[] }>);
    for (const hook of HOOKS) {
      const snippet = snippets.find((s) => s.body[0] === hook);
      assert.ok(snippet, `no snippet starts with "${hook}"`);
      assert.strictEqual(snippet.body[snippet.body.length - 1], END_OF(hook));
    }
  });
});
