import * as os from 'os';
import * as path from 'path';
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
import { CommandResult, PROJECT_CONFIG_GLOB, runCommandIn } from '../environment/commandRunner';
import { copybookPathArgs } from '../environment/copybookPaths';
import { isCopybookPath } from '../environment/cobolPaths';
import { INVOCATION_SETTINGS, resolveCliInvocationConfig } from '../environment/invocationConfig';
import { ZAPP_FILE_GLOB } from '../environment/zappConfig';
import {
  BoundaryInfo,
  collectBoundaries,
  FlowTargets,
  MOCK_CATEGORIES,
  boundaryKeyCandidates,
  detectCompletionContext,
  flowTargetsFromSource,
  keyReplaceLengthAfterCursor,
} from './cutCompletionLogic';

interface BoundaryCacheEntry {
  cblMtimeMs: number;
  boundaries: BoundaryInfo[];
  // MOCK PARAGRAPH / MOCK SECTION keys, scanned from the program text.
  flowTargets: FlowTargets;
}

// Keyed by the program's path and invalidated when its mtime moves. The
// boundaries are the program's (and its copybooks'), never the suite's:
// keying on the .cut too meant a half-typed MOCK line on disk cached an
// empty list until the next parseable save (#100). A completion request is
// not worth a fresh `collect --boundaries` process on every keystroke.
const boundaryCache = new Map<string, BoundaryCacheEntry>();

async function loadBoundaries(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): Promise<BoundaryCacheEntry | null> {
  const cutPath = document.uri.fsPath;
  const cblPath = resolveCblPath(cutPath);
  const fs = await import('fs/promises');
  let cblStat;
  try {
    cblStat = await fs.stat(cblPath);
  } catch {
    return null; // no paired program on disk -- nothing to offer
  }

  const cached = boundaryCache.get(cblPath);
  if (cached && cached.cblMtimeMs === cblStat.mtimeMs) {
    return cached;
  }

  const { executablePath, copybookPaths, extraCopybookPaths } = await resolveCliInvocationConfig(context, document.uri);
  const run = runCommandIn(path.dirname(cutPath));
  const collect = (suitePath: string): Promise<CommandResult> =>
    run(executablePath, [
      'collect',
      cblPath,
      '--cut',
      suitePath,
      '--json',
      '--boundaries',
      ...copybookPathArgs(copybookPaths, extraCopybookPaths),
    ]);
  const payload = await collectBoundaries(cutPath, collect, () => collectWithThrowawaySuite(collect));
  // A failed `collect` (the .cbl does not parse yet, the CLI is absent) is
  // cached as an empty list against the same mtime, so a typist does not
  // spawn a CLI process on every keystroke; the program's next save
  // invalidates it.
  const boundaries = payload.boundaries ?? [];
  let flowTargets: FlowTargets = { paragraphs: [], sections: [] };
  try {
    flowTargets = flowTargetsFromSource((await fs.readFile(cblPath, 'utf8')).split(/\r?\n/));
  } catch {
    // unreadable program: no PARAGRAPH/SECTION keys to offer
  }
  const entry: BoundaryCacheEntry = {
    cblMtimeMs: cblStat.mtimeMs,
    boundaries,
    flowTargets,
  };
  boundaryCache.set(cblPath, entry);
  return entry;
}

// The fallback collectBoundaries needs for a CLI that predates boundaries
// next to a suite parse error: a temp suite with nothing in it to fail.
async function collectWithThrowawaySuite(
  collect: (suitePath: string) => Promise<CommandResult>
): Promise<CommandResult> {
  const fs = await import('fs/promises');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockymock-completion-'));
  try {
    const suitePath = path.join(dir, 'boundaries.cut');
    await fs.writeFile(suitePath, 'TESTSUITE "boundaries"\n');
    return await collect(suitePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function activateCutCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      if (document.uri.scheme !== 'file' || isExcludedCutPath(document.uri.fsPath, vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath)) {
        return undefined;
      }
      const lineText = document.lineAt(position).text;
      const lineTextBeforeCursor = lineText.slice(0, position.character);
      const completionContext = detectCompletionContext(lineTextBeforeCursor);
      if (completionContext === null) return undefined;

      if (completionContext.kind === 'category') {
        return MOCK_CATEGORIES.map((category) => {
          const item = new vscode.CompletionItem(category, vscode.CompletionItemKind.Keyword);
          item.detail = 'mockymock MOCK category';
          return item;
        });
      }

      if (completionContext.kind === 'rows') {
        const item = new vscode.CompletionItem('ROWS', vscode.CompletionItemKind.Keyword);
        item.range = new vscode.Range(position.translate(0, -completionContext.partial.length), position);
        item.detail =
          'one row per FETCH/READ/RETURN, or one response per CALL/MQ/DLI/CICS call (those also need a TERMINAL ( ... ) line)';
        return [item];
      }

      const loaded = await loadBoundaries(context, document);
      if (!loaded) return undefined;
      // Replace exactly the token typed so far (which may start with a
      // quote and contain hyphens): VS Code's default word boundary stops
      // at both, so without an explicit range accepting `INV-FILE` after
      // typing `INV-F` would yield `INV-INV-FILE`. The range also takes in
      // an auto-closed quote right after the cursor.
      const range = new vscode.Range(
        position.translate(0, -completionContext.partial.length),
        position.translate(
          0,
          keyReplaceLengthAfterCursor(completionContext.partial, lineText.slice(position.character))
        )
      );
      const category = completionContext.category;
      if (category === 'PARAGRAPH' || category === 'SECTION') {
        const targets = category === 'PARAGRAPH' ? loaded.flowTargets.paragraphs : loaded.flowTargets.sections;
        return targets.map(({ name, line }) => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
          item.range = range;
          item.detail = `${category.toLowerCase()} at line ${line}`;
          return item;
        });
      }
      const candidates = boundaryKeyCandidates(loaded.boundaries, category);
      return candidates.map(({ insertText, boundary }) => {
        const item = new vscode.CompletionItem(insertText, vscode.CompletionItemKind.Value);
        item.range = range;
        item.detail = `${boundary.label} in ${boundary.paragraph} (line ${boundary.line})`;
        return item;
      });
    },
  };

  // The cache is keyed on the .cbl mtime only, but a project config
  // change (copybook_path, say), a zapp.yml, the copybook-path settings or
  // a copybook's own contents all change what `collect --boundaries` sees.
  const configWatcher = vscode.workspace.createFileSystemWatcher(PROJECT_CONFIG_GLOB);
  const zappWatcher = vscode.workspace.createFileSystemWatcher(ZAPP_FILE_GLOB);
  const dropCache = (): void => boundaryCache.clear();
  context.subscriptions.push(
    configWatcher,
    configWatcher.onDidChange(dropCache),
    configWatcher.onDidCreate(dropCache),
    configWatcher.onDidDelete(dropCache),
    zappWatcher,
    zappWatcher.onDidChange(dropCache),
    zappWatcher.onDidCreate(dropCache),
    zappWatcher.onDidDelete(dropCache),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (INVOCATION_SETTINGS.some((setting) => e.affectsConfiguration(setting))) dropCache();
    }),
    vscode.languages.registerCompletionItemProvider('cut', provider, ' '),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isCopybookPath(document.uri.fsPath)) dropCache();
      if (/\.(cut|cbl|cob|cobol)$/i.test(document.uri.fsPath)) {
        // A saved .cbl may have changed the boundary set (a saved .cut may
        // pair with a different program); the mtime check above would
        // already catch this on the next request, but dropping the cache
        // entry outright avoids serving a stale list for the split second
        // before the new mtime is observed.
        const cblPath = document.uri.fsPath.endsWith('.cut') ? resolveCblPath(document.uri.fsPath) : document.uri.fsPath;
        boundaryCache.delete(cblPath);
      }
    })
  );
}
