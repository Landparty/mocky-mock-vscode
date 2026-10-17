import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Every snippet must expand to a line mockymock's parser accepts with the
// meaning its description promises; mocky-mock's dsl/parser.py is the
// source of truth.
const snippets = Object.entries(
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snippets/cut.code-snippets'), 'utf8')) as Record<
    string,
    { prefix: string; body: string[] }
  >
);

// The choices of `${n|a,b,c|}` placeholders on a line that starts with MOCK.
const mockCategoryChoices = (line: string): string[] => {
  const match = /^\s*MOCK \$\{\d+\|([^|]*)\|\}/.exec(line);
  return match ? match[1].split(',') : [];
};

describe('.cut snippet contributions', () => {
  it('never writes a bare-key MOCK CALL, which the DSL reads as a dynamic CALL', () => {
    for (const [name, { body }] of snippets) {
      for (const line of body) {
        assert.ok(!/^\s*MOCK CALL \$\{\d+:/.test(line), `"${name}" writes an unquoted MOCK CALL key: ${line}`);
        if (/\$\{\d+:[^}]*\}\s*$/.test(line)) {
          assert.ok(!mockCategoryChoices(line).includes('CALL'), `"${name}" offers CALL with a bare key: ${line}`);
        }
      }
    }
  });

  it('offers a shared static CALL mock', () => {
    const snippet = snippets.find(([, s]) => s.prefix === 'before-each-mock-call')?.[1];
    assert.ok(snippet, 'no before-each-mock-call snippet');
    assert.ok(snippet.body.some((line) => /^\s*MOCK CALL "\$\{\d+:[^}]*\}"$/.test(line)));
  });
});
