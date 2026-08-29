import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Every command VS Code shows in the Command Palette comes from
// package.json's contributes.commands, but only a registerCommand() call in
// src/ actually makes it *do* anything -- a declared-but-unregistered
// command throws "command 'x' not found" the moment a user picks it, and an
// unregistered-but-declared one is dead weight no menu can reach. Nothing
// else in this repo checks that the two sides agree.
//
// The eight per-analyzer commands are registered from a loop over
// ANALYZER_OPTIONS in analysis/analyzeCobol.ts rather than as literals, so
// they are matched against that array's `id` fields instead. That module
// imports 'vscode' (unresolvable under mocha, which is why this reads the
// source text rather than importing it) -- the same reason the other
// manifest contract tests in this repo read package.json rather than
// importing it.
interface Manifest {
  contributes: {
    commands?: Array<{ command: string; title: string; category?: string }>;
    menus?: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
    submenus?: Array<{ id: string; label: string }>;
  };
}

const repoRoot = process.cwd();
const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// Every src/**/*.ts file, so a command registered in a module this test
// doesn't know about is still counted.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const ANALYZER_COMMAND_PREFIX = 'mockymock.analyzeCobol.';

const declaredCommands = (manifest.contributes.commands ?? []).map((c) => c.command);

const literallyRegistered = new Set<string>();
for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/registerCommand\(\s*'([^']+)'/g)) {
    literallyRegistered.add(match[1]);
  }
}

// The `id:` fields of ANALYZER_OPTIONS, which the registration loop turns
// into `mockymock.analyzeCobol.${id}`.
const analyzeCobolSource = readSource('src/analysis/analyzeCobol.ts');
const analyzerIds = [...analyzeCobolSource.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
const analyzerCommands = analyzerIds.map((id) => `${ANALYZER_COMMAND_PREFIX}${id}`);

const registeredCommands = new Set<string>([...literallyRegistered, ...analyzerCommands]);

describe('package.json command contribution', () => {
  it('registers a handler for every declared command', () => {
    const declaredButUnregistered = declaredCommands.filter((c) => !registeredCommands.has(c));
    assert.deepStrictEqual(
      declaredButUnregistered,
      [],
      `contributes.commands declares command(s) with no registerCommand() in src/: ${declaredButUnregistered.join(', ')}`
    );
  });

  it('declares every command it registers', () => {
    const declared = new Set(declaredCommands);
    const registeredButUndeclared = [...registeredCommands].filter((c) => !declared.has(c));
    assert.deepStrictEqual(
      registeredButUndeclared,
      [],
      `src/ registers command(s) missing from contributes.commands: ${registeredButUndeclared.join(', ')}`
    );
  });

  it('found the ANALYZER_OPTIONS ids (guards this test against its own regex rotting)', () => {
    // If the array is ever reshaped so the regex above stops matching,
    // analyzerCommands silently empties and the first assertion would then
    // fail loudly rather than pass vacuously -- but only if something also
    // pins the expected count, which is what this does.
    assert.ok(analyzerIds.length >= 8, `expected to find the analyzer ids, found: ${analyzerIds.join(', ')}`);
    assert.ok(analyzerIds.includes('deadCode'));
    assert.ok(analyzerIds.includes('dynamicCall'));
  });

  it('points every menu entry at a declared command', () => {
    const declared = new Set(declaredCommands);
    const declaredSubmenus = new Set((manifest.contributes.submenus ?? []).map((s) => s.id));
    for (const [menuId, entries] of Object.entries(manifest.contributes.menus ?? {})) {
      for (const entry of entries) {
        if (entry.command !== undefined) {
          assert.ok(
            declared.has(entry.command),
            `menus.${menuId} references undeclared command "${entry.command}"`
          );
        }
        if (entry.submenu !== undefined) {
          assert.ok(
            declaredSubmenus.has(entry.submenu),
            `menus.${menuId} references undeclared submenu "${entry.submenu}"`
          );
        }
      }
    }
  });

  it('lists every analyzer in the Analyze COBOL submenu', () => {
    const submenuEntries = (manifest.contributes.menus?.['mockymock.analyzeCobol.submenu'] ?? [])
      .map((e) => e.command)
      .filter((c): c is string => c !== undefined);
    assert.deepStrictEqual(
      [...submenuEntries].sort(),
      [...analyzerCommands].sort(),
      'the Analyze COBOL submenu and ANALYZER_OPTIONS have drifted apart'
    );
  });
});
