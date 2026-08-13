// src/focusStatements/focusFoldingProvider.ts
import * as vscode from 'vscode';
import { findFocusRanges, computeFoldRanges, LineRange } from './statementRanges';
import { defaultFoldRanges } from './defaultFoldRanges';

// Registering this provider at all replaces VS Code's indentation-based
// folding for the `cobol` language entirely -- there is no per-call
// fallback to indentation folding for documents this provider declines to
// opine on. So an unfocused document does NOT return [] (that would leave
// every COBOL file with no folding at all, a regression nobody asked for);
// it returns defaultFoldRanges' structural division/section/paragraph
// folds instead. Only a focused document gets the "everything except
// SQL/CICS/CALL statements" gaps.
export class FocusStatementsFoldingProvider implements vscode.FoldingRangeProvider {
  private readonly focusedUris = new Set<string>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeFoldingRanges = this.changeEmitter.event;

  isFocused(document: vscode.TextDocument): boolean {
    return this.focusedUris.has(document.uri.toString());
  }

  setFocused(document: vscode.TextDocument, focused: boolean): void {
    const key = document.uri.toString();
    if (focused) {
      this.focusedUris.add(key);
    } else {
      this.focusedUris.delete(key);
    }
    this.changeEmitter.fire();
  }

  forget(uri: vscode.Uri): void {
    this.focusedUris.delete(uri.toString());
  }

  private focusGapsForLines(sourceLines: string[]): LineRange[] {
    return computeFoldRanges(sourceLines.length, findFocusRanges(sourceLines));
  }

  // Exposed so the toggle command can tell, before invoking editor.foldAll,
  // whether there's anything to fold at all for the document as it stands
  // right now (see activateFocusStatements.ts's foldFocusedRanges).
  focusGapsFor(document: vscode.TextDocument): LineRange[] {
    return this.focusGapsForLines(document.getText().split(/\r?\n/));
  }

  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    // Split once and reuse it for whichever branch applies -- provideFoldingRanges
    // can be invoked frequently, so a duplicate full-document split per call is
    // worth avoiding on large COBOL files.
    const sourceLines = document.getText().split(/\r?\n/);
    const ranges = this.isFocused(document) ? this.focusGapsForLines(sourceLines) : defaultFoldRanges(sourceLines);
    // FoldingRange is 0-indexed; our ranges are 1-indexed inclusive lines.
    return ranges.map((range) => new vscode.FoldingRange(range.startLine - 1, range.endLine - 1));
  }
}
