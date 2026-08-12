import * as assert from 'assert';
import { fetchProgramFlowMermaid, ProgramFlowMermaidFetchError } from './programFlowMermaidClient';
import type { CommandRunner } from '../environment/commandRunner';

function fakeRunner(result: { code: number; stdout: string; stderr: string }): CommandRunner {
  return async () => result;
}

describe('fetchProgramFlowMermaid', () => {
  it('returns stdout on success', async () => {
    const run = fakeRunner({ code: 0, stdout: '%% Program: TEST\nflowchart TD\n', stderr: '' });
    const text = await fetchProgramFlowMermaid(run, 'mockymock', '/x/TEST.cbl', []);
    assert.strictEqual(text, '%% Program: TEST\nflowchart TD\n');
  });

  it('throws ProgramFlowMermaidFetchError on nonzero exit', async () => {
    const run = fakeRunner({ code: 1, stdout: '', stderr: 'parse error: line 5\n' });
    await assert.rejects(
      () => fetchProgramFlowMermaid(run, 'mockymock', '/x/TEST.cbl', []),
      (err: unknown) => err instanceof ProgramFlowMermaidFetchError && err.message.includes('parse error')
    );
  });

  it('passes --format mermaid and --copybook-path through', async () => {
    let capturedArgs: string[] = [];
    const run: CommandRunner = async (_exe, args) => {
      capturedArgs = args;
      return { code: 0, stdout: 'flowchart TD\n', stderr: '' };
    };
    await fetchProgramFlowMermaid(run, 'mockymock', '/x/TEST.cbl', ['/cpy']);
    assert.deepStrictEqual(capturedArgs, [
      'analyze', 'program-flow', '/x/TEST.cbl', '--format', 'mermaid', '--copybook-path', '/cpy',
    ]);
  });
});
