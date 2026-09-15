import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// This extension and the COBOL Analyzer extension
// (https://github.com/Landparty/cobol-analyzer) split one COBOL workflow in
// two: mockymock runs the program, COBOL Analyzer reads it. README's
// "Companion extension: COBOL Analyzer" is the user-facing statement of that
// split; this file is the machine-checkable half, so a feature that migrated
// cannot quietly come back and be contributed twice.
//
// Reads package.json and README.md as text rather than importing anything:
// every module that could answer these questions imports 'vscode', which
// mocha cannot resolve outside a running Extension Host -- the same reason
// the other manifest contract tests in this repo read the manifest.
interface Manifest {
  contributes: {
    languages?: Array<{ id: string; extensions?: string[]; configuration?: string }>;
    grammars?: Array<{ language?: string; scopeName: string }>;
    breakpoints?: Array<{ language: string }>;
    commands?: Array<{ command: string }>;
    configuration?: { properties?: Record<string, unknown> };
  };
}

const repoRoot = process.cwd();
const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

const languages = manifest.contributes.languages ?? [];
const cobolLanguage = languages.find((l) => l.id === 'cobol');

describe('companion extension split (COBOL Analyzer)', () => {
  // VS Code resolves a TextMate grammar by scopeName and a language
  // configuration by language id, and two extensions contributing the same
  // one conflict with no priority rule and no way to yield. COBOL Analyzer
  // owns both for COBOL; this side must not ship either.
  it('contributes no COBOL grammar', () => {
    const cobolGrammars = (manifest.contributes.grammars ?? []).filter(
      (g) => g.language === 'cobol' || g.scopeName === 'source.cobol'
    );
    assert.deepStrictEqual(
      cobolGrammars,
      [],
      'the cobol grammar belongs to the COBOL Analyzer extension; two extensions cannot contribute source.cobol'
    );
  });

  it('contributes no COBOL language configuration', () => {
    assert.strictEqual(
      cobolLanguage?.configuration,
      undefined,
      'the cobol language configuration belongs to the COBOL Analyzer extension'
    );
  });

  // The other half of the same rule: the language ENTRY has to stay. Language
  // ids merge across extensions where grammars do not, and VS Code only
  // offers the breakpoint gutter on a language some extension named in
  // contributes.breakpoints. Dropping this entry as "COBOL Analyzer's job"
  // would silently disable COBOL breakpoints for anyone without that
  // extension installed.
  it('keeps the minimal cobol language entry the debugger needs', () => {
    assert.ok(cobolLanguage, 'contributes.languages no longer declares the cobol id');
    for (const ext of ['.cbl', '.cob', '.cobol']) {
      assert.ok(
        cobolLanguage?.extensions?.includes(ext),
        `the cobol language entry no longer claims ${ext}`
      );
    }
    assert.ok(
      (manifest.contributes.breakpoints ?? []).some((b) => b.language === 'cobol'),
      'contributes.breakpoints no longer names cobol, so COBOL breakpoints are off'
    );
  });

  // The analysis surface migrated wholesale. A setting reappearing here is
  // the early symptom: the diagnostics that follow it would double up with
  // COBOL Analyzer's on the same lines of the same file.
  it('declares no setting from the migrated COBOL analysis surface', () => {
    const declared = Object.keys(manifest.contributes.configuration?.properties ?? {});
    const migrated = declared.filter((key) =>
      /^mockymock\.(moveCheckOnSave|lintRules|inlayHints|referenceLens|columnDiagnostics|format\.|workspaceIndex\.|workspaceAnalysis\.|expand)/.test(
        key
      )
    );
    assert.deepStrictEqual(
      migrated,
      [],
      `these belong to the COBOL Analyzer extension now: ${migrated.join(', ')}`
    );
  });

  // Reaching into the companion's namespace is fine for copybookPaths --
  // it is the one setting the two share on purpose -- and wrong for
  // executablePath, which names a different binary on each side.
  it('never reads cobolAnalyzer.executablePath', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const text = fs.readFileSync(full, 'utf8');
          // Bounded by [^;] so it matches one expression rather than
          // drifting into the next statement (or into the comment in
          // invocationConfig.ts that explains why this is never read).
          if (/getConfiguration\(\s*'cobolAnalyzer'[^;]*executablePath/.test(text)) {
            offenders.push(path.relative(repoRoot, full));
          }
        }
      }
    };
    walk(path.join(repoRoot, 'src'));
    assert.deepStrictEqual(
      offenders,
      [],
      `cobolAnalyzer.executablePath points at cobol-parser, not mockymock: ${offenders.join(', ')}`
    );
  });

  it('shares copybookPaths with the companion', () => {
    const text = fs.readFileSync(path.join(repoRoot, 'src/environment/invocationConfig.ts'), 'utf8');
    assert.match(
      text,
      /getConfiguration\(\s*'cobolAnalyzer'[^;]*copybookPaths/,
      'invocationConfig no longer falls back to cobolAnalyzer.copybookPaths; a user would have to declare their copybook libraries twice'
    );
  });

  // The split is only useful if a user can find out about it.
  it('documents the split in the README', () => {
    assert.match(readme, /## Companion extension: COBOL Analyzer/);
    assert.match(readme, /github\.com\/Landparty\/cobol-analyzer/);
  });
});
