import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { presentStatus, statusTooltipMarkdown, SetupState } from './statusPresentation';

const states: SetupState[] = [
  'checking',
  'ready',
  'installing',
  'cli-missing',
  'cli-blocked',
  'docker-stopped',
  'docker-failed',
  'docker-missing',
];

describe('status bar presentation', () => {
  it('stays quiet (no colour, short text) when ready or checking', () => {
    for (const state of ['ready', 'checking'] as const) {
      const p = presentStatus(state);
      assert.strictEqual(p.background, undefined, state);
      assert.ok(!p.text.includes(':'), `${state} text should be just the name: ${p.text}`);
    }
  });

  it('colours every problem state so it stands out', () => {
    for (const state of states.filter((s) => !['ready', 'checking', 'installing'].includes(s))) {
      assert.ok(presentStatus(state).background, `${state} has no background colour`);
    }
  });

  it('uses the detail message for a blocked CLI when given', () => {
    assert.strictEqual(presentStatus('cli-blocked', 'Gatekeeper said no').summary, 'Gatekeeper said no');
  });

  it('only links to commands that exist', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const declared = new Set<string>(manifest.contributes.commands.map((c: { command: string }) => c.command));
    for (const state of states) {
      const md = statusTooltipMarkdown(presentStatus(state));
      for (const m of md.matchAll(/\(command:([\w.]+)/g)) {
        const id = m[1];
        assert.ok(declared.has(id) || id.startsWith('workbench.'), `tooltip links unknown command ${id}`);
      }
    }
  });
});
