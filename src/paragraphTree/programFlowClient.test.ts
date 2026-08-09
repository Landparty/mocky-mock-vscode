import assert from 'node:assert/strict';
import { fetchProgramFlow, ProgramFlowFetchError } from './programFlowClient';
import { CommandRunner } from '../environment/commandRunner';

describe('fetchProgramFlow', () => {
  it('invokes mockymock analyze program-flow and parses the JSON report', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.equal(cmd, 'mockymock');
      assert.deepEqual(args, ['analyze', 'program-flow', '/p/PROG.cbl', '--compact', '--copybook-path', '/copy']);
      return {
        code: 0,
        stdout: '{"program_name":"PROG","nodes":[],"edges":[],"entry_points":[],"unreachable_nodes":[]}',
        stderr: '',
      };
    };
    const report = await fetchProgramFlow(fakeRun, 'mockymock', '/p/PROG.cbl', ['/copy']);
    assert.equal(report.program_name, 'PROG');
  });

  it('throws ProgramFlowFetchError with stderr on nonzero exit', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 1, stdout: '', stderr: 'error: File not found\nmore detail\n' });
    await assert.rejects(
      () => fetchProgramFlow(fakeRun, 'mockymock', '/p/PROG.cbl', []),
      (err: unknown) => {
        assert.ok(err instanceof ProgramFlowFetchError);
        assert.equal(err.message, 'error: File not found');
        assert.match(err.stderr ?? '', /more detail/);
        return true;
      }
    );
  });

  it('throws ProgramFlowFetchError on invalid JSON', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 0, stdout: 'not json', stderr: '' });
    await assert.rejects(() => fetchProgramFlow(fakeRun, 'mockymock', '/p/PROG.cbl', []), ProgramFlowFetchError);
  });

  it('throws ProgramFlowFetchError when required arrays are missing', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 0, stdout: '{"program_name":"PROG"}', stderr: '' });
    await assert.rejects(() => fetchProgramFlow(fakeRun, 'mockymock', '/p/PROG.cbl', []), ProgramFlowFetchError);
  });
});
