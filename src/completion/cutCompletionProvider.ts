// src/completion/cutCompletionProvider.ts
//
// Completion for the .cut DSL: MOCK category names (static), then the
// program's own real boundary keys for whichever category was typed
// (via `mockymock collect --boundaries`, cached per document version so
// a fast typist doesn't spawn a CLI process on every keystroke). See
// docs/2026-09-15-cut-editor-intelligence-design.md (sibling mocky-mock
// repo) for the design this implements.
import * as vscode from 'vscode';
import { isExcludedCutPath, resolveCblPath } from '../discovery/cutDiscovery';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import {
  BoundaryInfo,
  MOCK_CATEGORIES,
  boundaryKeyCandidates,
  detectCompletionContext,
} from './cutCompletionLogic';

interface BoundaryCacheEntry {
  cutMtimeMs: number;
  cblMtimeMs: number;
  boundaries: BoundaryInfo[];
}

// Keyed by the .cut file's own path -- one cache entry per open document,
// invalidated whenever either file's own mtime moves. A completion
// request is not worth a fresh `collect --boundaries` process on every
// keystroke inside an unrelated part of the file.
const boundaryCache = new Map<string, BoundaryCacheEntry>();

async function loadBoundaries(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): Promise<BoundaryInfo[] | null> {
  const cutPath = document.uri.fsPath;
  const cblPath = resolveCblPath(cutPath);
  const fs = await import('fs/promises');
  let cutStat;
  let cblStat;
  try {
    [cutStat, cblStat] = await Promise.all([fs.stat(cutPath), fs.stat(cblPath)]);
  } catch {
    return null; // no paired program on disk -- nothing to offer
  }

  const cached = boundaryCache.get(cutPath);
  if (
    cached &&
    cached.cutMtimeMs === cutStat.mtimeMs &&
    cached.cblMtimeMs === cblStat.mtimeMs
  ) {
    return cached.boundaries;
  }

  const { executablePath, copybookPaths } = resolveInvocationConfig(context, document.uri);
  const args = ['collect', cblPath, '--cut', cutPath, '--json', '--boundaries'];
  for (const p of copybookPaths) args.push('--copybook-path', p);

  const result = await runCommand(executablePath, args);
  let payload: { boundaries?: BoundaryInfo[] } = {};
  if (result.code === 0) {
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      payload = {};
    }
  }
  // A failed `collect` (the .cbl does not parse yet, the CLI is absent) is
  // cached as an empty list against the same mtimes, so a typist inside a
  // broken file does not spawn a CLI process on every keystroke; the next
  // save of either file invalidates it.
  const boundaries = payload.boundaries ?? [];
  boundaryCache.set(cutPath, {
    cutMtimeMs: cutStat.mtimeMs,
    cblMtimeMs: cblStat.mtimeMs,
    boundaries,
  });
  return boundaries;
}

export function activateCutCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      if (document.uri.scheme !== 'file' || isExcludedCutPath(document.uri.fsPath)) {
        return undefined;
      }
      const lineTextBeforeCursor = document.lineAt(position).text.slice(0, position.character);
      const completionContext = detectCompletionContext(lineTextBeforeCursor);
      if (completionContext === null) return undefined;

      if (completionContext.kind === 'category') {
        return MOCK_CATEGORIES.map((category) => {
          const item = new vscode.CompletionItem(category, vscode.CompletionItemKind.Keyword);
          item.detail = 'mockymock MOCK category';
          return item;
        });
      }

      const boundaries = await loadBoundaries(context, document);
      if (!boundaries) return undefined;
      const candidates = boundaryKeyCandidates(boundaries, completionContext.category);
      // Replace exactly the token typed so far (which may start with a
      // quote and contain hyphens): VS Code's default word boundary stops
      // at both, so without an explicit range accepting `INV-FILE` after
      // typing `INV-F` would yield `INV-INV-FILE`.
      const range = new vscode.Range(
        position.translate(0, -completionContext.partial.length),
        position
      );
      return candidates.map(({ insertText, boundary }) => {
        const item = new vscode.CompletionItem(insertText, vscode.CompletionItemKind.Value);
        item.range = range;
        item.detail = `${boundary.label} in ${boundary.paragraph} (line ${boundary.line})`;
        return item;
      });
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('cut', provider, ' '),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.(cut|cbl|cob|cobol)$/i.test(document.uri.fsPath)) {
        // A saved .cut/.cbl may have changed the boundary set; the mtime
        // check above would already catch this on the next request, but
        // dropping the cache entry outright avoids serving a stale list
        // for the split second before the new mtime is observed.
        const cutPath = document.uri.fsPath.endsWith('.cut')
          ? document.uri.fsPath
          : document.uri.fsPath.replace(/\.(cbl|cob|cobol)$/i, '.cut');
        boundaryCache.delete(cutPath);
      }
    })
  );
}
