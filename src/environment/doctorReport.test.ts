import * as assert from 'assert';
import { formatDoctorReport, parseDoctorJson, projectProblems } from './doctorReport';

const SAMPLE = JSON.stringify({
  ready: true,
  checked_at: '2026-10-13T22:03:29+00:00',
  image: 'mockymock-gnucobol:2a4e4deb',
  container: 'mockymock-cobc',
  cobc_version: '3.2.0',
  checks: [
    { id: 'daemon', label: 'Docker daemon', state: 'ok', detail: 'reachable' },
    { id: 'cobol_parser', label: 'cobol-parser', state: 'ok', detail: 'importable, 1.10.0' },
    {
      id: 'config_file',
      label: 'config file',
      state: 'warn',
      detail: "/ws/cobol.yml: 'copybook_path' must be a string or a list of strings",
    },
    { id: 'ai_mode', label: 'AI assistant mode', state: 'ok', detail: 'guided' },
  ],
});

describe('parseDoctorJson', () => {
  it('parses a doctor --json report', () => {
    const report = parseDoctorJson(SAMPLE);
    assert.ok(report);
    assert.strictEqual(report!.ready, true);
    assert.deepStrictEqual(
      report!.checks.map((c) => [c.id, c.state]),
      [
        ['daemon', 'ok'],
        ['cobol_parser', 'ok'],
        ['config_file', 'warn'],
        ['ai_mode', 'ok'],
      ]
    );
  });

  it('returns null for output from a CLI that predates doctor', () => {
    assert.strictEqual(parseDoctorJson(''), null);
    assert.strictEqual(parseDoctorJson('usage: mockymock [-h]'), null);
    assert.strictEqual(parseDoctorJson('{"version": 1}'), null);
  });

  it('drops a check with an unknown state rather than guessing', () => {
    const report = parseDoctorJson(JSON.stringify({ ready: true, checks: [{ id: 'x', label: 'x', state: 'weird' }] }));
    assert.deepStrictEqual(report!.checks, []);
  });
});

describe('projectProblems', () => {
  it('reports only the cobol-parser and config-file checks that are not ok', () => {
    const problems = projectProblems(parseDoctorJson(SAMPLE)!);
    assert.deepStrictEqual(
      problems.map((c) => c.id),
      ['config_file']
    );
  });

  it('ignores Docker checks, which the extension probes and fixes itself', () => {
    const report = parseDoctorJson(
      JSON.stringify({ ready: false, checks: [{ id: 'daemon', label: 'Docker daemon', state: 'down', detail: '' }] })
    )!;
    assert.deepStrictEqual(projectProblems(report), []);
  });
});

describe('formatDoctorReport', () => {
  it('renders one aligned line per check plus a verdict', () => {
    const text = formatDoctorReport(parseDoctorJson(SAMPLE)!);
    const lines = text.split('\n');
    assert.strictEqual(lines.length, 5);
    assert.ok(lines[0].startsWith('OK      Docker daemon      '));
    assert.ok(lines[2].startsWith('WARN    config file        /ws/cobol.yml'));
    assert.strictEqual(lines[4], 'mockymock doctor: ready');
  });
});
