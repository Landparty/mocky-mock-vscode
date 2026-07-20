import * as assert from 'assert';
import { toCrlf, formatRunHeader, formatRunTrailer, createOutputStreamer } from './outputFormatting';

describe('toCrlf', () => {
  it('converts bare LF to CRLF', () => {
    assert.strictEqual(toCrlf('a\nb\n'), 'a\r\nb\r\n');
  });

  it('leaves existing CRLF untouched (no doubling)', () => {
    assert.strictEqual(toCrlf('a\r\nb\r\n'), 'a\r\nb\r\n');
  });

  it('normalizes mixed line endings', () => {
    assert.strictEqual(toCrlf('a\r\nb\nc'), 'a\r\nb\r\nc');
  });
});

describe('formatRunHeader', () => {
  it('includes the file name and a running indicator, in CRLF', () => {
    assert.strictEqual(formatRunHeader('FOO.cut'), toCrlf('=== FOO.cut ===\nRunning mockymock…\n'));
  });
});

describe('formatRunTrailer', () => {
  it('reports the exit code, in CRLF', () => {
    assert.strictEqual(formatRunTrailer(0), toCrlf('\nexit code: 0\n'));
    assert.strictEqual(formatRunTrailer(1), toCrlf('\nexit code: 1\n'));
  });
});

describe('createOutputStreamer', () => {
  it('passes stdout chunks straight through, CRLF-converted', () => {
    const out: string[] = [];
    const streamer = createOutputStreamer((text) => out.push(text));
    streamer('line1\nline2\n', 'stdout');
    assert.strictEqual(out.join(''), toCrlf('line1\nline2\n'));
  });

  it('inserts a "--- stderr ---" marker exactly once, on the first stderr chunk', () => {
    const out: string[] = [];
    const streamer = createOutputStreamer((text) => out.push(text));
    streamer('out1\n', 'stdout');
    streamer('err1\n', 'stderr');
    streamer('err2\n', 'stderr');
    const markers = out.filter((t) => t.includes('--- stderr ---'));
    assert.strictEqual(markers.length, 1);
    assert.strictEqual(out.join(''), toCrlf('out1\n--- stderr ---\nerr1\nerr2\n'));
  });

  it('does not double a \\r\\n that is split across two chunks', () => {
    const out: string[] = [];
    const streamer = createOutputStreamer((text) => out.push(text));
    streamer('line1\r', 'stdout');
    streamer('\nline2\n', 'stdout');
    assert.strictEqual(out.join(''), toCrlf('line1\r\nline2\n'));
    assert.ok(!/\r\r/.test(out.join('')), 'must not contain a doubled \\r');
  });

  it('carries a trailing bare \\r through unchanged when no chunk follows', () => {
    const out: string[] = [];
    const streamer = createOutputStreamer((text) => out.push(text));
    streamer('done\r', 'stdout');
    assert.strictEqual(out.join(''), 'done');
  });
});
