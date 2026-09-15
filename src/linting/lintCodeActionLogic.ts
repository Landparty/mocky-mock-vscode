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
