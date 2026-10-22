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
// Three ways to fill the file, best first:
//   1. `mockymock init` (needs Docker): one TESTCASE per scenario, run once,
//      with the values the program produced written as EXPECT lines -- a
//      characterization suite that pins today's behavior.
//   2. `mockymock generate` (Docker-free): the same cases (or one per
//      paragraph, with mockymock.newTestSuite.casePerParagraph) with every
//      CALL / file / SQL / CICS / DLI boundary mocked, and at most the
//      VERIFY call counts / folded EXPECTs the CLI can work out statically.
//      The toast says what it asserts, and why init didn't run.
//   3. buildStarterCut (pure template, no CLI at all, or a scaffold with no
//      cases): one TESTCASE that PERFORMs the first paragraph, with
//      commented MOVE/EXPECT guidance.
// The fallbacks mean the command never dead-ends: no Docker, a missing or
// too-old CLI still produce a valid, runnable suite, and the notification
// says which path was taken and why.
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runCommand, runCommandIn } from '../environment/commandRunner';
import {
  checkDocker,
  supportsGenerateCommand,
  supportsInitCommand,
  supportsPerParagraphFlag,
} from '../environment/checks';
import { resolveCliInvocationConfig } from '../environment/invocationConfig';
import { focusClickedFile, showNeedsFile } from '../environment/notify';
import { resolveCblPath, suitesForProgram } from '../discovery/cutDiscovery';
import { rememberPairing } from '../discovery/suitePairing';
import { newSuiteTarget } from '../discovery/suiteIndexService';
import { askSuiteTopic, NEW_SUITE, pickSuite } from '../navigation/suitePicker';
import { isExportedProgram, originalOfExport } from '../navigation/counterpartLogic';
import { isCobolPath } from '../environment/cobolPaths';
import {
  AssertionCount,
  buildGenerateArgs,
  buildInitArgs,
  buildStarterCut,
  countAssertions,
  describeCreatedSuite,
  describeEmptyScaffold,
  describeLintRefusedSuite,
  failureReason,
  initAssertsNothing,
  initRecordingFailure,
  isNoCaseRefusal,
  lintRefusalOf,
  parseGeneratedCaseCount,
  parseInitOutcome,
  shellArg,
  starterCutFacts,
} from './cutTemplate';

export const NEW_TEST_SUITE_COMMAND = 'mockymock.newTestSuite';
const COMMAND_LABEL = 'New Test Suite for This Program';

// `skipPicker`: the caller (Open Test Suite's picker) already listed the
// existing suites and the user chose "New Test Suite…" there.
interface NewTestSuiteOptions {
  skipPicker?: boolean;
}

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
    vscode.commands.registerCommand('mockymock.newTestSuite', async (uri?: vscode.Uri, options?: NewTestSuiteOptions) => {
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

      // An exported PROG.mainframe.cbl is build output (the menus hide this
      // command for it; the palette doesn't): a suite generated from it
      // would PERFORM mockymock's own injected driver paragraphs.
      if (isExportedProgram(activePath)) {
        const original = originalOfExport(activePath);
        const open = original ? `Open ${path.basename(original)}` : undefined;
        const choice = await vscode.window.showErrorMessage(
          `mockymock: "${path.basename(activePath)}" is an exported file (build output). Create test suites for the original program${original ? `, ${path.basename(original)}` : ''}.`,
          ...(open ? [open] : [])
        );
        if (original && choice === open) {
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(original));
        }
        return;
      }

      const cblPath = activePath;
      // A program that already has suites: open one, or name another.
      // Never regenerate over one -- adding cases is an edit.
      let topic: string | undefined;
      const existing = suitesForProgram(cblPath);
      if (existing.length) {
        const picked = options?.skipPicker ? NEW_SUITE : await pickSuite(cblPath, existing);
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

      const { executablePath, copybookPaths, extraCopybookPaths } = await resolveCliInvocationConfig(context, editor.document.uri);
      const channel = getOutputChannel();

      // The --help probe keeps the shared module-level runner: its positive
      // result is cached per runner, and a fresh runCommandIn closure would
      // never hit that cache.
      const canGenerate = await supportsGenerateCommand(runCommand, executablePath);
      if (canGenerate) {
        const runHere = runCommandIn(path.dirname(cblPath));
        const cblName = path.basename(cblPath);
        const cutName = path.basename(cutPath);
        const perParagraph =
          vscode.workspace
            .getConfiguration('mockymock', editor.document.uri)
            .get<boolean>('newTestSuite.casePerParagraph') ?? false;
        // init is scenario-only, so the per-paragraph option skips it.
        const dockerUp = !perParagraph && (await checkDocker(runCommand)) === 'available';
        let initTranscript = false;
        // The suggested `mockymock run` command is pasted into the
        // integrated terminal, which opens at the workspace root.
        const cblArg = shellArg(vscode.workspace.asRelativePath(cblPath, false));
        const cutArg = shellArg(vscode.workspace.asRelativePath(cutPath, false));

        if (dockerUp && (await supportsInitCommand(runCommand, executablePath))) {
          const initArgs = buildInitArgs(cblPath, cutPath, copybookPaths, extraCopybookPaths);
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `mockymock: creating ${cutName} and recording what ${cblName} does today…`,
            },
            () => runHere(executablePath, initArgs)
          );
          const caseCount = parseGeneratedCaseCount(result.stdout);
          // An empty TESTSUITE is nothing to open: let generate, and the
          // starter template after it, take over below.
          if (caseCount === 0 && (await exists(cutPath))) await fs.unlink(cutPath);
          if (await exists(cutPath)) {
            const outcome = parseInitOutcome(result.stdout);
            if (result.code === 0) {
              await openAndOffer(
                cutPath,
                describeCreatedSuite({
                  cblName,
                  cutName,
                  caseCount,
                  perParagraph: false,
                  cblArg,
                  cutArg,
                  ...(outcome.dockerSkipped
                    ? { dockerDown: true, assertions: await assertionsIn(cutPath) }
                    : { recorded: outcome.recorded }),
                })
              );
              return;
            }
            // The suite was written but lint refuses it (init stops after
            // generate then), or the recording run failed (a compile
            // error, a case that crashed): the file is still the best
            // starting point, so open it and say what went wrong.
            showInChannel(channel, initArgs, result);
            const refusal = lintRefusalOf(result);
            await openAndWarn(
              channel,
              cutPath,
              refusal
                ? describeLintRefusedSuite(cutName, refusal)
                : initAssertsNothing(result)
                ? `mockymock: created ${cutName} and ran it, but none of its test cases asserts anything yet. Add an EXPECT on what ${cblName} writes before relying on it.`
                : `mockymock: created ${cutName}, but recording what the program does failed, so some cases may have no EXPECT lines yet: ${initRecordingFailure(result) ?? 'see Show Details'}`
            );
            return;
          }
          // init wrote nothing (generate's own refusals, or a generator that
          // can't handle this program): plain generate still may, below.
          showInChannel(channel, initArgs, result);
          initTranscript = true;
        }

        const generateArgs = buildGenerateArgs(
          cblPath,
          cutPath,
          copybookPaths,
          perParagraph && (await supportsPerParagraphFlag(runCommand, executablePath)),
          extraCopybookPaths
        );
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `mockymock: creating ${cutName}…` },
          () => runHere(executablePath, generateArgs)
        );
        const cliWrote = await exists(cutPath);
        const caseCount = parseGeneratedCaseCount(result.stdout);
        if ((cliWrote && caseCount === 0) || (!cliWrote && isNoCaseRefusal(result))) {
          // No boundary to mock, so no cases: an empty TESTSUITE runs
          // nothing. The starter at least PERFORMs the first paragraph.
          showInChannel(channel, generateArgs, result, { append: initTranscript });
          if (cliWrote) await fs.unlink(cutPath);
          await writeStarter(cblPath, cutPath, editor.document.getText());
          await openAndOffer(cutPath, describeEmptyScaffold(cblName, cutName));
          return;
        }
        if (result.code === 0 && cliWrote) {
          await openAndOffer(
            cutPath,
            describeCreatedSuite({
              cblName,
              cutName,
              caseCount,
              // An older CLI's plain generate, or the CLI's own fallback when
              // it can't build scenarios, is per-paragraph too.
              perParagraph: !/data-driven from a fixture bundle/.test(result.stdout),
              dockerDown: !perParagraph && !dockerUp,
              assertions: await assertionsIn(cutPath),
              cblArg,
              cutArg,
            })
          );
          return;
        }
        showInChannel(channel, generateArgs, result, { append: initTranscript });
        if (cliWrote) {
          // The CLI wrote the full scaffold and still failed: since
          // mocky-mock #231 that means lint refuses what it wrote.
          const refusal = lintRefusalOf(result);
          await openAndWarn(
            channel,
            cutPath,
            refusal
              ? describeLintRefusedSuite(cutName, refusal)
              : `mockymock: created ${cutName}, but mockymock generate reported a problem: ${failureReason(result)}`
          );
          return;
        }
        // A refusal (parse error, unresolved copybook, ...) is worth a
        // look, but it shouldn't leave the user with nothing: fall back
        // to the template and say why the richer scaffold didn't happen.
        await writeStarter(cblPath, cutPath, editor.document.getText());
        await openAndWarn(
          channel,
          cutPath,
          `mockymock: created a basic ${cutName}. The full scaffold (with mocks) was skipped because mockymock couldn't analyze the program: ${failureReason(result)}`
        );
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

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Generated VERIFY / EXPECT lines, so the toast says what the file asserts.
async function assertionsIn(cutPath: string): Promise<AssertionCount | undefined> {
  try {
    return countAssertions(await fs.readFile(cutPath, 'utf8'));
  } catch {
    return undefined;
  }
}

// Open the file first -- the toast blocks until dismissed, and the file is
// the point -- then warn, with the transcript behind "Show Details".
async function openAndWarn(channel: vscode.OutputChannel, cutPath: string, message: string): Promise<void> {
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(cutPath));
  const showDetails = 'Show Details';
  const choice = await vscode.window.showWarningMessage(message, showDetails);
  if (choice === showDetails) channel.show();
}

// The full transcript behind a "Show Details" button. `append` keeps an
// earlier command's transcript (init, before generate was tried).
function showInChannel(
  channel: vscode.OutputChannel,
  args: string[],
  result: CliResult,
  options: { append?: boolean } = {}
): void {
  if (!options.append) channel.clear();
  channel.appendLine(`$ mockymock ${args.join(' ')}`);
  channel.appendLine(result.stdout);
  channel.appendLine(result.stderr);
}
