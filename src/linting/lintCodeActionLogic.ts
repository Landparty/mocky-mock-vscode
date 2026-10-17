// Pure predicate for whether a lint diagnostic carries mockymock's
// suggested-fix continuation text -- split out of lintCodeActionProvider.ts
// so it's unit-testable outside the Extension Host (mocha cannot resolve
// `vscode` -- see lintOutput.ts's own doc comment for why every testable
// piece of this extension is split this way).

// The exact continuation line checks.py appends after a suggested_fix'd
// UNMOCKED_* reason (see mockymock/analysis/refusal/_gates.py). Matched
// against the diagnostic's own (already-folded) message text rather than
// re-parsing raw CLI output a second time.
const HAS_SUGGESTED_FIX = 'Add to this TESTCASE:';

// Duck-typed against vscode.Diagnostic's shape rather than importing the
// type itself, so this module stays vscode-free.
export interface DiagnosticLike {
  source?: string;
  message: string;
}

export function hasSuggestedFix(diagnostic: DiagnosticLike): boolean {
  return diagnostic.source === 'mockymock' && diagnostic.message.includes(HAS_SUGGESTED_FIX);
}

// `generate --fill` writes the blocks it can and still exits 1 when lint
// would refuse something no MOCK block fixes (an UNKNOWN_PARAGRAPH, a
// terminator layout, an UNMOCKED_* with no mechanical fix). A non-zero
// exit is only a failure when nothing was added: otherwise the file
// changed and the leftovers are the news. `leftovers` are the
// "mockymock generate: ..." lines printed after the header, prefix
// dropped.
export interface FillOutcome {
  added: number;
  leftovers: string[];
}

export function parseFillOutcome(stdout: string): FillOutcome {
  const added = /added (\d+) mock block/.exec(stdout);
  const leftovers = stdout
    .split(/\r?\n/)
    .map((line) => /^mockymock generate: (.*)$/.exec(line.trim())?.[1])
    .filter((line): line is string => !!line);
  return { added: added ? Number(added[1]) : 0, leftovers };
}

// The warning for a fill that inserted blocks but left problems behind.
export function describePartialFill(outcome: FillOutcome): string {
  const n = outcome.added;
  const left = outcome.leftovers.length ? outcome.leftovers.join('; ') : 'see the remaining diagnostics';
  return `mockymock: added ${n} mock block${n === 1 ? '' : 's'}, but lint still refuses this suite for reasons no MOCK block can fix: ${left}`;
}
