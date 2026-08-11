// src/outline/outlineProvider.ts
import * as vscode from 'vscode';
import { buildOutline, OutlineNode, OutlineNodeKind } from './outlineModel';

const SYMBOL_KINDS: Record<OutlineNodeKind, vscode.SymbolKind> = {
  division: vscode.SymbolKind.Module,
  programId: vscode.SymbolKind.Class,
  section: vscode.SymbolKind.Namespace,
  dataItem: vscode.SymbolKind.Field,
  paragraph: vscode.SymbolKind.Method,
};

// selectionRange is just the node's own header/label line (what gets
// highlighted and jumped to on click); range extends through endLine so
// Outline's "highlight the enclosing symbol as the cursor moves" and
// breadcrumb navigation cover the node's whole body, not just its first
// line.
function toDocumentSymbol(document: vscode.TextDocument, node: OutlineNode): vscode.DocumentSymbol {
  const startLine = document.lineAt(node.startLine - 1);
  const endLine = document.lineAt(Math.min(node.endLine - 1, document.lineCount - 1));
  const symbol = new vscode.DocumentSymbol(
    node.name,
    node.detail ?? '',
    SYMBOL_KINDS[node.kind],
    startLine.range.union(endLine.range),
    startLine.range
  );
  symbol.children = node.children.map((child) => toDocumentSymbol(document, child));
  return symbol;
}

export class CobolOutlineProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const sourceLines = document.getText().split(/\r?\n/);
    return buildOutline(sourceLines).map((node) => toDocumentSymbol(document, node));
  }
}

// Registered for the whole `cobol` language -- not gated behind
// mockymock.cobolOpen or any CLI/Docker check, unlike Boundaries/
// Paragraph Tree. VS Code calls a DocumentSymbolProvider automatically to
// populate the Outline panel and editor breadcrumb bar for any open
// cobol-language document.
export function activateOutlineProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider({ language: 'cobol' }, new CobolOutlineProvider())
  );
}
