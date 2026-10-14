// src/newTestSuite/newTestSuite.ts
//
// "New Test Suite for This Program": the zero-to-first-test step. Given an
// open COBOL program, creates its suite where the project keeps them --
// tests/<folder>/PROG.cut by default, per `mockymock suites` (see
// suiteIndexService.ts) -- and opens it. The .cut watcher in
// testController.ts then adds it to the Test Explorer on its own, and the
// lint-on-open pass checks it immediately. A program that already has
// suites gets a picker: open one, or name another (PROG.<topic>.cut).
//
// Two ways to fill the file, best first:
//   1. `mockymock generate` (Docker-free): one TESTCASE per paragraph with
//      every CALL / file / SQL / CICS / DLI boundary already mocked.
//   2. buildStarterCut (pure template, no CLI at all): one TESTCASE that
//      PERFORMs the first paragraph, with commented MOVE/EXPECT guidance.
// The fallback means the command never dead-ends: a missing or too-old CLI
// still produces a valid, runnable suite, and the notification says which
// path was taken and why.
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runCommand, runCommandIn } from '../environment/commandRunner';
import { supportsGenerateCommand } from '../environment/checks';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { firstNonEmptyLine } from '../environment/textUtils';
import { focusClickedFile, showNeedsFile } from '../environment/notify';
import { resolveCblPath, suitesForProgram } from '../discovery/cutDiscovery';
import { rememberPairing } from '../discovery/suitePairing';
import { newSuiteTarget } from '../discovery/suiteIndexService';
import { askSuiteTopic, NEW_SUITE, pickSuite } from '../navigation/suitePicker';
import { isCobolPath } from '../environment/cobolPaths';
import { buildGenerateArgs, buildStarterCut, parseGeneratedCaseCount, starterCutFacts } from './cutTemplate';

export const NEW_TEST_SUITE_COMMAND = 'mockymock.newTestSuite';
const COMMAND_LABEL = 'New Test Suite for This Program';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('mockymock: New Test Suite');
  }
  return outputChannel;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function openAndOffer(cutPath: string, message: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(cutPath);
  await vscode.window.showTextDocument(doc);
  const showExplorer = 'Show Test Explorer';
  const choice = await vscode.window.showInformationMessage(message, showExplorer);
  if (choice === showExplorer) {
    await vscode.commands.executeCommand('workbench.view.testing.focus');
  }
}

export function activateNewTestSuiteCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push({
    dispose: () => {
      outputChannel?.dispose();
      outputChannel = undefined;
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.newTestSuite', async (uri?: vscode.Uri) => {
      await focusClickedFile(uri);
      const editor = vscode.window.activeTextEditor;
      const activePath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;

      // Already looking at a suite: the only sensible thing is to point
      // out that this IS the suite, and offer to jump to its program.
      if (activePath?.endsWith('.cut')) {
        const cblPath = resolveCblPath(activePath);
        const openProgram = 'Open the Program';
        const choice = await vscode.window.showInformationMessage(
          `mockymock: "${path.basename(activePath)}" is already a test suite. To add cases, edit it here; type "testcase" for a snippet.`,
          ...((await exists(cblPath)) ? [openProgram] : [])
        );
        if (choice === openProgram) {
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(cblPath));
        }
        return;
      }

      if (!activePath || !isCobolPath(activePath) || !editor) {
        await showNeedsFile(COMMAND_LABEL, 'cobol', NEW_TEST_SUITE_COMMAND);
        return;
      }

      const cblPath = activePath;
      // A program that already has suites: open one, or name another.
      // Never regenerate over one -- adding cases is an edit.
      let topic: string | undefined;
      const existing = suitesForProgram(cblPath);
      if (existing.length) {
        const picked = await pickSuite(cblPath, existing);
        if (picked === undefined) return;
        if (picked !== NEW_SUITE) {
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(picked));
          return;
        }
        topic = await askSuiteTopic(cblPath);
        if (!topic) return;
      }

      const target = await newSuiteTarget(cblPath, topic);
      const cutPath = target.path;
      if (await exists(cutPath)) {
        // Never overwrite a suite someone may have spent hours on -- open
        // the existing one instead.
        await openAndOffer(
          cutPath,
          `mockymock: ${path.basename(cutPath)} already exists -- opened it. Add more cases there (type "testcase" for a snippet).`
        );
        return;
      }

      // The CLI scaffolder reads the file from disk while the fallback
      // reads the editor buffer -- both must see the same program, and the
      // Test Explorer will run whatever is on disk anyway.
      if (editor.document.isDirty) {
        const save = 'Save and Continue';
        const choice = await vscode.window.showWarningMessage(
          `mockymock: save "${path.basename(cblPath)}" first so the new test suite matches what's on disk.`,
          save
        );
        if (choice !== save) return;
        if (!(await editor.document.save())) return;
      }

      await fs.mkdir(path.dirname(cutPath), { recursive: true });
      // Lint and completion run the moment the file opens, before the
      // watcher-driven pairing refresh lands.
      rememberPairing(cutPath, cblPath);

      const { executablePath, copybookPaths } = resolveInvocationConfig(context, editor.document.uri);
      const channel = getOutputChannel();

      // The --help probe keeps the shared module-level runner: its positive
      // result is cached per runner, and a fresh runCommandIn closure would
      // never hit that cache.
      const canGenerate = await supportsGenerateCommand(runCommand, executablePath);
      if (canGenerate) {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `mockymock: creating ${path.basename(cutPath)}…` },
          () => runCommandIn(path.dirname(cblPath))(executablePath, buildGenerateArgs(cblPath, cutPath, copybookPaths))
        );
        if (result.code === 0 && (await exists(cutPath))) {
          const count = parseGeneratedCaseCount(result.stdout);
          const what = count === null ? 'a starter test suite' : `${count} starter test case${count === 1 ? '' : 's'}`;
          await openAndOffer(
            cutPath,
            `mockymock: created ${path.basename(cutPath)} with ${what} -- every boundary is mocked, fill in the MOVE and EXPECT lines and press play.`
          );
          return;
        }
        // A refusal (parse error, unresolved copybook, ...) is worth a
        // look, but it shouldn't leave the user with nothing: fall through
        // to the template and say why the richer scaffold didn't happen.
        channel.clear();
        channel.appendLine(`$ mockymock ${buildGenerateArgs(cblPath, cutPath, copybookPaths).join(' ')}`);
        channel.appendLine(result.stdout);
        channel.appendLine(result.stderr);
        const reason = firstNonEmptyLine(result.stderr) ?? firstNonEmptyLine(result.stdout) ?? `exit code ${result.code}`;
        // The CLI only writes its output on success, but don't bet a
        // crash on it: whatever is there now is what the user gets to edit.
        if (!(await exists(cutPath))) await writeStarter(cblPath, cutPath, editor.document.getText());
        // Open first: the toast below blocks until dismissed, and the file
        // is the point.
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(cutPath));
        const showDetails = 'Show Details';
        const choice = await vscode.window.showWarningMessage(
          `mockymock: created a basic ${path.basename(cutPath)}. The full scaffold (with mocks) was skipped because mockymock couldn't analyze the program: ${reason}`,
          showDetails
        );
        if (choice === showDetails) channel.show();
        return;
      }

      // No usable CLI: the template needs nothing but the source text.
      // Which is also why this deliberately doesn't block on the CLI being
      // installed -- writing the first test shouldn't wait for setup.
      await writeStarter(cblPath, cutPath, editor.document.getText());
      await openAndOffer(
        cutPath,
        `mockymock: created ${path.basename(cutPath)}. Fill in the MOVE and EXPECT lines, then press play in the Test Explorer.`
      );
    })
  );
}

async function writeStarter(cblPath: string, cutPath: string, sourceText: string): Promise<void> {
  // A suite away from its program (under tests/) names it explicitly, so
  // it pairs even without a CLI to mirror the folders.
  const besideProgram = path.resolve(path.dirname(cutPath)) === path.resolve(path.dirname(cblPath));
  const programLine = besideProgram ? undefined : path.relative(path.dirname(cutPath), cblPath).split(path.sep).join('/');
  const text = buildStarterCut(starterCutFacts(cblPath, sourceText.split(/\r?\n/)), programLine);
  // 'wx': create only -- the exists() check above races with nothing
  // in practice, but refusing to clobber is the whole point of this command.
  await fs.writeFile(cutPath, text, { encoding: 'utf8', flag: 'wx' });
}
