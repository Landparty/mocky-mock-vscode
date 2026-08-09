/**
 * Extract the first non-empty line from text.
 *
 * Splits by newlines, trims whitespace from each line, and returns the first
 * line that has content. Returns undefined if all lines are empty or the input
 * is empty.
 *
 * Commonly used to extract the first error message from multi-line stderr
 * streams for user-facing error messages.
 */
export function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}
