// src/environment/saveBeforeCli.ts
//
// Commands that hand file paths to the CLI make it read those files from
// disk, so unsaved edits in an open editor would silently be left out.
// Saves every dirty open document among `paths` first; false when a save
// failed or was declined, so the caller can stop before running the CLI.
// (A Test Explorer run gets this from VS Code's testing.saveBeforeTest; a
// command that calls the CLI itself has to do it.)
import * as vscode from 'vscode';
import * as path from 'path';

export async function saveBeforeCli(paths: string[], action: string): Promise<boolean> {
  const wanted = new Set(paths.map((p) => path.resolve(p)));
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.scheme !== 'file' || !doc.isDirty || !wanted.has(path.resolve(doc.uri.fsPath))) continue;
    if (!(await doc.save())) {
      void vscode.window.showErrorMessage(`mockymock: save "${path.basename(doc.uri.fsPath)}" before ${action}.`);
      return false;
    }
  }
  return true;
}
