import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// The interactive debug session's target is the paired .cbl (testController.ts
// builds the config with `program: cblPath`, and buildDebugArgs passes it to
// `mockymock debug <program> --dap-stdio`). But VS Code only offers the
// breakpoint gutter on a file whose *language id* some extension has declared
// in `contributes.breakpoints` -- otherwise the click never reaches our debug
// adapter at all. These assertions pin the manifest side of that contract, in
// package.json, which no other test covers.
//
// Read rather than imported: tsconfig.json doesn't enable resolveJsonModule,
// and mocha runs from the repo root so cwd is stable here.
interface LanguageContribution {
  id: string;
  extensions?: string[];
}

interface Manifest {
  contributes: {
    languages?: LanguageContribution[];
    breakpoints?: Array<{ language: string }>;
    debuggers?: Array<{ type: string; languages?: string[] }>;
  };
}

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
);

describe('package.json breakpoint contributions', () => {
  it('contributes a cobol language id covering the .cbl files debug sessions target', () => {
    const cobol = (manifest.contributes.languages ?? []).find((language) => language.id === 'cobol');
    assert.ok(cobol, 'expected a contributed language with id "cobol"');
    assert.ok(
      (cobol.extensions ?? []).includes('.cbl'),
      'expected the cobol language to claim .cbl -- resolveCblPath only ever pairs a .cut with a .cbl'
    );
  });

  it('enables breakpoints for the cobol language', () => {
    assert.ok(
      (manifest.contributes.breakpoints ?? []).some((entry) => entry.language === 'cobol'),
      'expected contributes.breakpoints to list the cobol language, without which VS Code disables the .cbl breakpoint gutter'
    );
  });

  it('names cobol as a language the mockymock-cobol debugger defaults for', () => {
    const debuggerEntry = (manifest.contributes.debuggers ?? []).find(
      (entry) => entry.type === 'mockymock-cobol'
    );
    assert.ok(debuggerEntry, 'expected a contributed debugger of type "mockymock-cobol"');
    assert.ok(
      (debuggerEntry.languages ?? []).includes('cobol'),
      'the debug session targets the paired .cbl, so cobol belongs in the debugger\'s default-debugger languages'
    );
  });

  it('still contributes the cut language it already had', () => {
    assert.ok(
      (manifest.contributes.languages ?? []).some((language) => language.id === 'cut'),
      'adding cobol must not displace the existing cut language contribution'
    );
  });
});
