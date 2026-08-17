// src/navigation/definitionProvider.ts
import * as vscode from 'vscode';
import { buildDefinitionIndex, DefinitionIndex, SymbolLocation } from './definitionModel';

function toLocation(document: vscode.TextDocument, location: SymbolLocation): vscode.Location {
  const range = new vscode.Range(
    new vscode.Position(location.line - 1, location.startColumn),
    new vscode.Position(location.line - 1, location.endColumn)
  );
  return new vscode.Location(document.uri, range);
}

// Rebuilds the index on every call rather than caching -- same tradeoff
// outlineProvider.ts makes (buildOutline() runs fresh per
// provideDocumentSymbols call). COBOL source files are small enough that a
// full re-scan per invocation is not a perceptible cost, and caching would
// need document-version invalidation for no real benefit here.
function lookupWord(document: vscode.TextDocument, position: vscode.Position): { key: string; index: DefinitionIndex } | undefined {
  const range = document.getWordRangeAtPosition(position);
  if (!range) return undefined;
  const word = document.getText(range);
  const index = buildDefinitionIndex(document.getText().split(/\r?\n/));
  return { key: word.toUpperCase(), index };
}

export class CobolDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition | undefined {
    const found = lookupWord(document, position);
    if (!found) return undefined;
    const decl = found.index.declarations.get(found.key);
    return decl ? toLocation(document, decl.location) : undefined;
  }
}

export class CobolReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext
  ): vscode.Location[] | undefined {
    const found = lookupWord(document, position);
    if (!found) return undefined;
    const decl = found.index.declarations.get(found.key);
    if (!decl) return undefined;

    const locations = (found.index.references.get(found.key) ?? []).map((loc) => toLocation(document, loc));
    if (context.includeDeclaration) {
      locations.unshift(toLocation(document, decl.location));
    }
    return locations;
  }
}

// Registered for the whole `cobol` language, same as the Outline provider --
// this is what makes VS Code's built-in "Go to Definition" / "Find All
// References" / Peek context-menu entries appear and work for COBOL
// variables, condition-names, paragraphs, and sections. No custom command
// or menu contribution needed.
export function activateDefinitionProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider({ language: 'cobol' }, new CobolDefinitionProvider()),
    vscode.languages.registerReferenceProvider({ language: 'cobol' }, new CobolReferenceProvider())
  );
}
