// src/navigation/counterpartLogic.ts
//
// Which file is the "other half" of the one being edited: a program's .cut
// suites, or a suite's program. Pure (no `vscode` import) so mocha can test
// it -- counterpart.ts wires it to commands and context keys.
import * as fs from 'fs';
import { resolveCblPath, resolveCutPath, suitesForProgram } from '../discovery/cutDiscovery';
import { pairingError } from '../discovery/suitePairing';
import { isCobolPath } from '../environment/cobolPaths';

export type Counterpart =
  | { kind: 'suite'; path: string; exists: boolean; all: string[] }
  // `error`: the CLI's reason it could not pair the suite, when it gave one.
  | { kind: 'program'; path: string; exists: boolean; error?: string };

export function counterpartOf(
  fsPath: string,
  exists: (p: string) => boolean = fs.existsSync,
  listDir?: (dir: string) => string[]
): Counterpart | undefined {
  if (fsPath.toLowerCase().endsWith('.cut')) {
    const error = pairingError(fsPath);
    const program = resolveCblPath(fsPath, exists);
    if (error !== undefined) return { kind: 'program', path: program, exists: false, error };
    return { kind: 'program', path: program, exists: exists(program) };
  }
  // An exported PROG.mainframe.cbl is build output, not a program with a
  // suite of its own -- offering "New Test Suite" on it would scaffold a
  // PROG.mainframe.cut nobody wants.
  if (isCobolPath(fsPath) && !isExportedProgram(fsPath)) {
    const all = suitesForProgram(fsPath, exists, listDir);
    return { kind: 'suite', path: all[0] ?? resolveCutPath(fsPath), exists: all.length > 0, all };
  }
  return undefined;
}

const EXPORT_SUFFIX = '.mainframe.cbl';

// An exported PROG.mainframe.cbl (`mockymock export`'s output).
export function isExportedProgram(fsPath: string): boolean {
  return fsPath.toLowerCase().endsWith(EXPORT_SUFFIX);
}

// The program PROG.mainframe.cbl was exported from: PROG.cbl (or .cob /
// .cobol) beside it, undefined when none is there.
export function originalOfExport(fsPath: string, exists: (p: string) => boolean = fs.existsSync): string | undefined {
  if (!isExportedProgram(fsPath)) return undefined;
  const stem = fsPath.slice(0, -EXPORT_SUFFIX.length);
  for (const ext of ['.cbl', '.CBL', '.cob', '.COB', '.cobol', '.COBOL']) {
    if (exists(stem + ext)) return stem + ext;
  }
  return undefined;
}
