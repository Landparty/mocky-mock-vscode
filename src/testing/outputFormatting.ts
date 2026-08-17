export function toCrlf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

// Printed once, before the mockymock process is spawned, so the Test Results
// output panel shows *something* immediately instead of sitting blank for the
// entire (Docker-backed, often multi-second) compile+run.
export function formatRunHeader(fileName: string): string {
  return toCrlf(`=== ${fileName} ===\nRunning mockymock…\n`);
}

// Printed once the process has exited. stdout/stderr are streamed live as
// they're produced (see OutputListener in commandRunner.ts) rather than
// re-printed here, so this is just the terminal marker for "it's done".
export function formatRunTrailer(exitCode: number): string {
  return toCrlf(`\nexit code: ${exitCode}\n`);
}

// Wraps a raw appendOutput sink with two pieces of state a naive per-chunk
// toCrlf() can't handle on its own:
//  - stderr marker: printed once, the first time a stderr chunk arrives, so a
//    reader watching the live transcript can still tell stdout/stderr apart
//    even though both streams are interleaved as they arrive.
//  - CRLF chunk-boundary carry: if a chunk happens to end in a bare '\r' whose
//    matching '\n' is the first byte of the *next* chunk, converting each
//    chunk independently would treat them as two unrelated newlines and
//    double the '\r' in the output. The trailing '\r' is held back and
//    prepended to the next chunk instead, so the pair is normalized together.
export interface OutputStreamer {
  (chunk: string, stream: 'stdout' | 'stderr'): void;
  /**
   * Emits a held-back trailing '\r' once no further chunks can arrive.
   * Without this, output whose final byte is a bare '\r' (an in-place
   * progress line cut off by cancellation) loses its terminator forever.
   * Call after the process has exited.
   */
  flush(): void;
}

export function createOutputStreamer(appendOutput: (text: string) => void): OutputStreamer {
  let sawStderr = false;
  let pendingCr = false;

  const streamer = ((chunk, stream) => {
    if (stream === 'stderr' && !sawStderr) {
      sawStderr = true;
      appendOutput(toCrlf('--- stderr ---\n'));
    }

    let text = pendingCr ? `\r${chunk}` : chunk;
    pendingCr = false;
    if (text.endsWith('\r')) {
      pendingCr = true;
      text = text.slice(0, -1);
    }
    if (text) appendOutput(toCrlf(text));
  }) as OutputStreamer;

  streamer.flush = () => {
    if (pendingCr) {
      pendingCr = false;
      appendOutput('\r');
    }
  };

  return streamer;
}
