import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// The Getting Started walkthrough and the Test Explorer welcome content are
// the first things a new user sees, and both are pure package.json data
// that VS Code fails SILENTLY on: a step whose markdown file is missing
// renders an empty pane, and a `command:` link to an unregistered command
// shows a "command not found" toast the moment someone clicks it. Nothing
// else in this repo would notice either. Read (not imported) for the same
// reason as commandContribution.test.ts.
interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  media: { markdown?: string; image?: string | Record<string, string>; svg?: string };
  completionEvents?: string[];
}

interface Manifest {
  publisher: string;
  name: string;
  contributes: {
    commands?: Array<{ command: string }>;
    walkthroughs?: Array<{ id: string; title: string; description: string; steps: WalkthroughStep[] }>;
    viewsWelcome?: Array<{ view: string; contents: string; when?: string }>;
    menus?: { commandPalette?: Array<{ command: string; when?: string }> };
  };
}

const repoRoot = process.cwd();
const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const declaredCommands = new Set((manifest.contributes.commands ?? []).map((c) => c.command));

// Built-in VS Code commands the walkthrough/welcome content is allowed to
// link to. Anything else must be one of this extension's own declared
// commands.
const BUILTIN_COMMANDS = new Set(['workbench.view.testing.focus', 'workbench.action.openWalkthrough']);

function commandLinksIn(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(command:([^)?\s]+)/g)].map((m) => m[1]);
}

function assertLinksResolve(markdown: string, where: string): void {
  for (const command of commandLinksIn(markdown)) {
    assert.ok(
      declaredCommands.has(command) || BUILTIN_COMMANDS.has(command),
      `${where} links to command "${command}", which is neither declared in contributes.commands nor a known built-in`
    );
  }
}

describe('package.json walkthrough contribution', () => {
  const walkthroughs = manifest.contributes.walkthroughs ?? [];

  it('contributes exactly one Getting Started walkthrough', () => {
    assert.strictEqual(walkthroughs.length, 1);
    assert.strictEqual(walkthroughs[0].id, 'gettingStarted');
  });

  it("matches the id extension.ts opens via workbench.action.openWalkthrough", () => {
    // notify.ts's WALKTHROUGH_ID is `${publisher}.${name}#${walkthrough id}`
    // -- read from source rather than imported, since notify.ts imports
    // 'vscode' and cannot load under mocha.
    const notifySource = fs.readFileSync(path.join(repoRoot, 'src', 'environment', 'notify.ts'), 'utf8');
    const match = /WALKTHROUGH_ID = '([^']+)'/.exec(notifySource);
    assert.ok(match, 'expected notify.ts to define WALKTHROUGH_ID');
    assert.strictEqual(match[1], `${manifest.publisher}.${manifest.name}#${walkthroughs[0].id}`);
  });

  it('ships a markdown page for every step, and every page exists on disk', () => {
    for (const step of walkthroughs[0].steps) {
      assert.ok(step.media.markdown, `step "${step.id}" has no markdown media`);
      const mediaPath = path.join(repoRoot, step.media.markdown);
      assert.ok(fs.existsSync(mediaPath), `step "${step.id}" points at a missing file: ${step.media.markdown}`);
      assert.ok(fs.readFileSync(mediaPath, 'utf8').trim().length > 0, `step "${step.id}"'s page is empty`);
    }
  });

  it('does not ignore the walkthrough pages out of the .vsix', () => {
    // .vscodeignore excludes media/** and docs/** wholesale, which is where
    // one would naturally put these -- so they live in walkthroughs/, and
    // this pins that directory as not-ignored.
    const ignore = fs.readFileSync(path.join(repoRoot, '.vscodeignore'), 'utf8').split(/\r?\n/);
    for (const step of walkthroughs[0].steps) {
      const dir = step.media.markdown!.split('/')[0];
      assert.ok(
        !ignore.some((line) => line.trim() === `${dir}/**` || line.trim() === dir),
        `.vscodeignore excludes ${dir}/, so step "${step.id}"'s page would not ship`
      );
    }
  });

  it('only links to commands that exist', () => {
    for (const step of walkthroughs[0].steps) {
      assertLinksResolve(step.description, `walkthrough step "${step.id}"`);
      for (const event of step.completionEvents ?? []) {
        const commandEvent = /^onCommand:(.+)$/.exec(event);
        if (commandEvent) {
          assert.ok(
            declaredCommands.has(commandEvent[1]) || BUILTIN_COMMANDS.has(commandEvent[1]),
            `step "${step.id}" completes on unknown command "${commandEvent[1]}"`
          );
        }
      }
    }
  });

  it('gives every step a unique id', () => {
    const ids = walkthroughs[0].steps.map((s) => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, `duplicate step ids: ${ids.join(', ')}`);
  });
});

describe('package.json Test Explorer welcome contribution', () => {
  const welcome = (manifest.contributes.viewsWelcome ?? []).filter((v) => v.view === 'testing');

  it('offers a way to create the first suite when the Test Explorer is empty', () => {
    assert.strictEqual(welcome.length, 1, 'expected exactly one viewsWelcome entry for the testing view');
    assert.ok(
      commandLinksIn(welcome[0].contents).includes('mockymock.newTestSuite'),
      'the empty Test Explorer should link straight to mockymock.newTestSuite'
    );
  });

  it('only links to commands that exist', () => {
    for (const entry of welcome) assertLinksResolve(entry.contents, 'viewsWelcome[testing]');
  });
});

describe('package.json Command Palette gating', () => {
  const palette = manifest.contributes.menus?.commandPalette ?? [];

  // The per-analyzer commands this used to gate moved to the cobol-analyzer
  // extension along with the rest of the COBOL analysis surface, so there is
  // nothing left here to hide from the palette. What still matters is that
  // none of them came back: a command id declared by both extensions is
  // resolved by load order, silently.
  it('no longer declares the migrated COBOL analysis commands', () => {
    const migrated = [...declaredCommands].filter((c) =>
      /^mockymock\.(analyzeCobol|programFlow|paragraphTree|generateData|focusStatements)/.test(c)
    );
    assert.deepStrictEqual(migrated, [], `these belong to cobol-analyzer now: ${migrated.join(', ')}`);
  });

  it('keeps the entry points a new user needs reachable from any editor', () => {
    // These must NOT be gated: they are how someone with nothing open gets
    // started, and the walkthrough links to two of them.
    for (const command of ['mockymock.checkEnvironment', 'mockymock.openWalkthrough']) {
      const entry = palette.find((e) => e.command === command);
      assert.ok(entry === undefined, `${command} must stay unconditionally visible in the Command Palette`);
    }
  });

  it('only gates declared commands', () => {
    for (const entry of palette) {
      assert.ok(declaredCommands.has(entry.command), `commandPalette gates undeclared command "${entry.command}"`);
    }
  });
});
