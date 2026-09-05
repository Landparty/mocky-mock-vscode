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
// This reads the source text rather than importing it: the modules that
// register commands import 'vscode', which mocha cannot resolve outside a
// running Extension Host -- the same reason the other manifest contract
// tests in this repo read package.json rather than importing it.
interface Manifest {
  contributes: {
    commands?: Array<{ command: string; title: string; category?: string }>;
    menus?: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
    submenus?: Array<{ id: string; label: string }>;
  };
}

const repoRoot = process.cwd();
const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

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

const declaredCommands = (manifest.contributes.commands ?? []).map((c) => c.command);

const registeredCommands = new Set<string>();
for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/registerCommand\(\s*'([^']+)'/g)) {
    registeredCommands.add(match[1]);
  }
}

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

  // Guards the two assertions above against passing vacuously if the regex
  // ever stops matching (e.g. a refactor to double-quoted ids).
  it('found the registrations at all', () => {
    assert.ok(registeredCommands.size > 0, 'no registerCommand() calls were found in src/');
    assert.ok(declaredCommands.length > 0, 'no commands are declared in package.json');
  });

  // The COBOL analysis commands moved to the cobol-analyzer extension. If one
  // reappears here, the two extensions are contributing the same command id
  // and whichever loads last silently wins.
  it('no longer declares any command from the migrated COBOL analysis surface', () => {
    const migrated = declaredCommands.filter((c) =>
      /^mockymock\.(analyzeCobol|programFlow|paragraphTree|generateData|focusStatements)/.test(c)
    );
    assert.deepStrictEqual(
      migrated,
      [],
      `these belong to the cobol-analyzer extension now: ${migrated.join(', ')}`
    );
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
});
