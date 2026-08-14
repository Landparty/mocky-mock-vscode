import assert from 'node:assert/strict';
import { fetchProgramFlowShared } from './sharedProgramFlowFetch';
import { CommandRunner } from '../environment/commandRunner';

const OK_STDOUT = '{"program_name":"PROG","nodes":[],"edges":[],"entry_points":[],"unreachable_nodes":[]}';

describe('fetchProgramFlowShared', () => {
  it('coalesces two concurrent calls for the same (executable, cblPath) into one CLI invocation', async () => {
    let invocations = 0;
    let resolveRun: (() => void) | undefined;
    const fakeRun: CommandRunner = async () => {
      invocations += 1;
      await new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
      return { code: 0, stdout: OK_STDOUT, stderr: '' };
    };

    const first = fetchProgramFlowShared(fakeRun, 'mockymock', '/p/COALESCE.cbl');
    const second = fetchProgramFlowShared(fakeRun, 'mockymock', '/p/COALESCE.cbl');
    // Let both callers reach the in-flight-map check before the run resolves.
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(resolveRun, 'fakeRun was never invoked -- coalescing did not happen');
    resolveRun();

    const [a, b] = await Promise.all([first, second]);
    assert.equal(invocations, 1);
    assert.equal(a.program_name, 'PROG');
    assert.equal(b.program_name, 'PROG');
  });

  it('does not coalesce calls for different .cbl paths', async () => {
    let invocations = 0;
    const fakeRun: CommandRunner = async () => {
      invocations += 1;
      return { code: 0, stdout: OK_STDOUT, stderr: '' };
    };

    await Promise.all([
      fetchProgramFlowShared(fakeRun, 'mockymock', '/p/A.cbl'),
      fetchProgramFlowShared(fakeRun, 'mockymock', '/p/B.cbl'),
    ]);
    assert.equal(invocations, 2);
  });

  it('re-invokes the CLI on a later call once the prior one has settled', async () => {
    let invocations = 0;
    const fakeRun: CommandRunner = async () => {
      invocations += 1;
      return { code: 0, stdout: OK_STDOUT, stderr: '' };
    };

    await fetchProgramFlowShared(fakeRun, 'mockymock', '/p/SEQUENTIAL.cbl');
    await fetchProgramFlowShared(fakeRun, 'mockymock', '/p/SEQUENTIAL.cbl');
    assert.equal(invocations, 2);
  });

  it('does not cache a failed request for a later call to reuse', async () => {
    let invocations = 0;
    const fakeRun: CommandRunner = async () => {
      invocations += 1;
      return invocations === 1
        ? { code: 1, stdout: '', stderr: 'error: boom' }
        : { code: 0, stdout: OK_STDOUT, stderr: '' };
    };

    await assert.rejects(() => fetchProgramFlowShared(fakeRun, 'mockymock', '/p/RETRY.cbl'));
    const report = await fetchProgramFlowShared(fakeRun, 'mockymock', '/p/RETRY.cbl');
    assert.equal(invocations, 2);
    assert.equal(report.program_name, 'PROG');
  });
});
