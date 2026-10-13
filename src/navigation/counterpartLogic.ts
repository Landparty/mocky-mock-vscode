// src/navigation/counterpartLogic.ts
//
// Which file is the "other half" of the one being edited: a program's .cut
// suite, or a suite's program. Pure (no `vscode` import) so mocha can test
// it -- counterpart.ts wires it to commands and context keys.
import * as fs from 'fs';
import { resolveCblPath, resolveCutPath } from '../discovery/cutDiscovery';
import { isCobolPath } from '../environment/cobolPaths';

export type Counterpart =
  | { kind: 'suite'; path: string; exists: boolean }
  | { kind: 'program'; path: string; exists: boolean };

export function counterpartOf(
  fsPath: string,
  exists: (p: string) => boolean = fs.existsSync
): Counterpart | undefined {
  if (fsPath.toLowerCase().endsWith('.cut')) {
    const program = resolveCblPath(fsPath, exists);
    return { kind: 'program', path: program, exists: exists(program) };
  }
  // An exported PROG.mainframe.cbl is build output, not a program with a
  // suite of its own -- offering "New Test Suite" on it would scaffold a
  // PROG.mainframe.cut nobody wants.
  if (isCobolPath(fsPath) && !fsPath.toLowerCase().endsWith('.mainframe.cbl')) {
    const suite = resolveCutPath(fsPath);
    return { kind: 'suite', path: suite, exists: exists(suite) };
  }
  return undefined;
}
