import assert from 'node:assert/strict';
import { firstNonEmptyLine } from './textUtils';

describe('firstNonEmptyLine', () => {
  it('returns the first non-empty line from multi-line text', () => {
    const text = '\n\nerror: File not found\nmore detail\n';
    assert.equal(firstNonEmptyLine(text), 'error: File not found');
  });

  it('trims whitespace from each line', () => {
    const text = '  \n  \t  leading and trailing spaces  \t  \n';
    assert.equal(firstNonEmptyLine(text), 'leading and trailing spaces');
  });

  it('returns undefined for all-blank input', () => {
    const text = '\n\n  \t  \n';
    assert.equal(firstNonEmptyLine(text), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(firstNonEmptyLine(''), undefined);
  });

  it('returns the only line if it is non-empty', () => {
    const text = 'single line';
    assert.equal(firstNonEmptyLine(text), 'single line');
  });
});
