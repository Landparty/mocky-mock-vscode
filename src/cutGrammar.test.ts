import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Line-level checks of syntaxes/cut.tmLanguage.json against statements
// mockymock's dsl/parser.py accepts. The grammar holds only single-line
// `match` rules, so a small scanner with TextMate's rule selection (the
// earliest match wins, ties go to the first rule listed; a capture with
// `patterns` is scanned again) is enough to check scopes without the
// vscode-textmate/oniguruma runtime.

interface Rule {
  match?: string;
  name?: string;
  include?: string;
  patterns?: Rule[];
  captures?: Record<string, Rule>;
}

interface Token {
  text: string;
  scopes: string[];
}

const grammar = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'syntaxes/cut.tmLanguage.json'), 'utf8')
) as { patterns: Rule[]; repository: Record<string, Rule> };

// Oniguruma's `(?i:...)` has no JavaScript spelling: rewrite each letter
// inside one (outside a character class) as a two-case class.
function toJsSource(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('(?i:', i)) {
      let depth = 1;
      let j = i + 4;
      let inner = '';
      let inClass = false;
      for (; j < source.length && depth > 0; j++) {
        const c = source[j];
        if (c === '\\') {
          inner += c + source[++j];
          continue;
        }
        if (inClass) {
          if (c === ']') inClass = false;
          inner += c;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === '(') depth++;
        else if (c === ')' && --depth === 0) break;
        inner += /[A-Za-z]/.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c;
      }
      out += `(?:${toJsSource(inner)})`;
      i = j + 1;
      continue;
    }
    out += source[i];
    if (source[i] === '\\') out += source[++i] ?? '';
    i++;
  }
  return out;
}

function resolve(rules: Rule[]): Rule[] {
  return rules.flatMap((rule) => {
    if (rule.include) return resolve([grammar.repository[rule.include.slice(1)]]);
    if (rule.patterns && !rule.match) return resolve(rule.patterns);
    return [rule];
  });
}

function scan(text: string, rules: Rule[], outer: string[]): Token[] {
  const flat = resolve(rules).filter((r) => r.match !== undefined);
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < text.length) {
    let best: { rule: Rule; m: RegExpExecArray } | undefined;
    for (const rule of flat) {
      const re = new RegExp(toJsSource(rule.match as string), 'gd');
      re.lastIndex = pos;
      const m = re.exec(text);
      if (m && m[0].length > 0 && (!best || m.index < best.m.index)) best = { rule, m };
    }
    if (!best) break;
    const { rule, m } = best;
    if (m.index > pos) tokens.push({ text: text.slice(pos, m.index), scopes: outer });
    const scopes = rule.name ? [...outer, rule.name] : outer;
    let at = m.index;
    const indices = m.indices as unknown as Array<[number, number] | undefined>;
    for (let g = 1; g < indices.length; g++) {
      const span = indices[g];
      const capture = rule.captures?.[String(g)];
      if (!span || !capture || span[0] < at) continue;
      if (span[0] > at) tokens.push({ text: text.slice(at, span[0]), scopes });
      const inner = capture.name ? [...scopes, capture.name] : scopes;
      const captured = text.slice(span[0], span[1]);
      tokens.push(...(capture.patterns ? scan(captured, capture.patterns, inner) : [{ text: captured, scopes: inner }]));
      at = span[1];
    }
    const end = m.index + m[0].length;
    if (end > at) tokens.push({ text: text.slice(at, end), scopes });
    pos = end;
  }
  if (pos < text.length) tokens.push({ text: text.slice(pos), scopes: outer });
  return tokens;
}

const tokenize = (line: string): Token[] => scan(line, grammar.patterns, []);

// The innermost scope of the token spelled exactly `text` (undefined when it
// has none; a failure when no token is spelled that way).
function scopeOf(line: string, text: string): string | undefined {
  const tokens = tokenize(line);
  const token = tokens.find((t) => t.text.trim() === text);
  assert.ok(token, `no token "${text}" in ${JSON.stringify(tokens)}`);
  return token.scopes[token.scopes.length - 1];
}

describe('.cut grammar: comments and literals', () => {
  it('treats only a line starting with *> as a comment', () => {
    assert.strictEqual(scopeOf('    *> a note', '*> a note'), 'comment.line.cut');
    assert.strictEqual(scopeOf('    PERFORM 0000-MAIN  *> run it', '0000-MAIN'), 'entity.name.function.paragraph.cut');
    assert.ok(!tokenize('    PERFORM 0000-MAIN  *> run it').some((t) => t.scopes.includes('comment.line.cut')));
  });

  it('highlights single-quoted literals as strings, *> inside them included', () => {
    assert.strictEqual(scopeOf("    MOVE 'STD' TO WS-ACCT-TIER", "'STD'"), 'string.quoted.single.cut');
    assert.strictEqual(scopeOf("    EXPECT WS-NOTE TO BE 'see *> here'", "'see *> here'"), 'string.quoted.single.cut');
    assert.strictEqual(scopeOf("    ROW 'x', 1", "'x'"), 'string.quoted.single.cut');
  });
});

describe('.cut grammar: CAPTURE and subscripted or qualified names', () => {
  it('highlights CAPTURE ARG <n> INTO <target>', () => {
    const line = '        CAPTURE ARG 2 INTO WS-CAP';
    assert.strictEqual(scopeOf(line, 'CAPTURE'), 'keyword.other.capture.cut');
    assert.strictEqual(scopeOf(line, 'INTO'), 'keyword.other.capture.cut');
    assert.strictEqual(scopeOf(line, '2'), 'constant.numeric.cut');
    assert.strictEqual(scopeOf(line, 'WS-CAP'), 'variable.other.cobol.cut');
    assert.strictEqual(scopeOf('        CAPTURE ARG 1 INTO WS-TAB(1, 2)', 'WS-TAB(1, 2)'), 'variable.other.cobol.cut');
  });

  it('highlights MOVE and EXPECT on a subscripted name with a comma or space inside', () => {
    assert.strictEqual(scopeOf('    MOVE 1 TO WS-TAB(1, 2)', 'MOVE'), 'keyword.other.move.cut');
    assert.strictEqual(scopeOf('    MOVE 1 TO WS-TAB(1, 2)', 'WS-TAB(1, 2)'), 'variable.other.cobol.cut');
    assert.strictEqual(scopeOf('    EXPECT WS-TAB(1 2) TO BE 5', 'EXPECT'), 'keyword.control.assertion.cut');
    assert.strictEqual(scopeOf('    EXPECT WS-TAB(1 2) TO BE 5', 'WS-TAB(1 2)'), 'variable.other.cobol.cut');
  });

  it('highlights a qualified name the same way', () => {
    assert.strictEqual(scopeOf('    MOVE 7 TO CUST-ID OF OUT-REC', 'CUST-ID OF OUT-REC'), 'variable.other.cobol.cut');
    assert.strictEqual(scopeOf('    EXPECT CUST-ID IN OUT-REC TO BE 7', 'CUST-ID IN OUT-REC'), 'variable.other.cobol.cut');
  });

  it('still highlights the plain forms', () => {
    assert.strictEqual(scopeOf('    MOVE 1 TO WS-X', 'WS-X'), 'variable.other.cobol.cut');
    assert.strictEqual(scopeOf('    EXPECT WS-TAB(1) TO BE 5', 'WS-TAB(1)'), 'variable.other.cobol.cut');
  });
});
