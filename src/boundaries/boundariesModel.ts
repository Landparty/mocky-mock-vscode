import type { BundleFieldSpec, BundleFixture, FixtureBundle } from './bundleTypes';

const PROGRAM_GROUP = '(program)';

export interface BoundaryNode {
  id: string; // `${paragraph ?? '(program)'}/${category}:${key}` — stable
  category: string;
  key: string;
  paragraph: string | null;
  line: number | null;
  direction: BundleFixture['direction'];
  layout: BundleFieldSpec[];
  seeded: boolean; // checkbox; default true
}

// A boundary the program only produces output to (WRITE/REWRITE, an SQL
// INSERT/UPDATE/DELETE) -- cobol-parser's ProgramFixtureGenerator never
// emits a BoundaryFixture for these (see _build_fixture's `direction ==
// "OUT"` branch, which returns fixture=None and a kind="stub" Expectation
// instead), so they can never appear in `groups` above. There's nothing to
// seed for them -- the program produces the value, not a mock -- so this
// carries no `seeded` flag; the tree renders these read-only. A CALL/DYNCALL
// boundary whose arguments are ALL OUT-direction has the same "never
// mocked" shape but is NOT recoverable here: cobol-parser only emits
// per-argument stubs for those (`ref` = the bare argument name), never a
// boundary-level `"CALL:KEY"` stub -- a known residual gap, not something
// this list can close.
export interface OutputOnlyBoundary {
  id: string; // `output:${category}:${key}`
  category: string;
  key: string;
  note: string | null;
}

export interface ParagraphGroup {
  paragraph: string;
  boundaries: BoundaryNode[];
}

export interface BoundariesViewModel {
  programName: string | null;
  seed: number;
  groups: ParagraphGroup[];
  outputOnly: OutputOnlyBoundary[];
  unresolved: string[];
}

function boundaryId(paragraph: string | null, category: string, key: string): string {
  return `${paragraph ?? PROGRAM_GROUP}/${category}:${key}`;
}

// The category vocabulary BoundaryInventoryAnalyzer emits (see
// docs/fixture-bundle-schema.md in cobol-parser) -- used to recognize a
// stub Expectation's `ref` as `CATEGORY:KEY` (a boundary-level stub) rather
// than a bare CALL argument name (which never contains ':' -- COBOL
// identifiers can't).
const KNOWN_CATEGORIES = new Set([
  'OPEN', 'CLOSE', 'READ', 'WRITE', 'REWRITE', 'DELETE', 'START', 'UNLOCK',
  'SQL', 'CICS', 'DLI', 'ACCEPT', 'CALL', 'DYNCALL',
]);

function parseBoundaryRef(ref: string): { category: string; key: string } | null {
  const idx = ref.indexOf(':');
  if (idx <= 0) return null;
  const category = ref.slice(0, idx);
  const key = ref.slice(idx + 1);
  if (!KNOWN_CATEGORIES.has(category) || key.length === 0) return null;
  return { category, key };
}

// Dedupes boundaries across scenarios by (paragraph, category, key), keeping
// the first-seen fixture (its layout/line win) in first-seen order, then
// groups by paragraph (null paragraph groups under '(program)'). A second
// pass over every scenario's `expectations` recovers the OUT-only
// boundaries that never got a BoundaryFixture at all (see
// OutputOnlyBoundary's doc comment) -- deduped by (category, key) and
// excluded whenever that same (category, key) already has a real,
// fixture-derived node (a BIDIRECTIONAL boundary's "OUT aspect" stub
// shares its ref with its own already-visible checkbox node).
export function buildViewModel(
  bundle: FixtureBundle,
  seededOverrides: Record<string, boolean>
): BoundariesViewModel {
  const seen = new Set<string>();
  const fixtureKeys = new Set<string>(); // `${category}:${key}`, any paragraph
  const groupOrder: string[] = [];
  const groups = new Map<string, ParagraphGroup>();

  for (const scenario of bundle.scenarios) {
    for (const fixture of scenario.fixtures) {
      fixtureKeys.add(`${fixture.category}:${fixture.key}`);
      const id = boundaryId(fixture.paragraph, fixture.category, fixture.key);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const groupKey = fixture.paragraph ?? PROGRAM_GROUP;
      let group = groups.get(groupKey);
      if (!group) {
        group = { paragraph: groupKey, boundaries: [] };
        groups.set(groupKey, group);
        groupOrder.push(groupKey);
      }

      group.boundaries.push({
        id,
        category: fixture.category,
        key: fixture.key,
        paragraph: fixture.paragraph,
        line: fixture.line,
        direction: fixture.direction,
        layout: fixture.layout,
        seeded: seededOverrides[id] ?? true,
      });
    }
  }

  const outputOnlySeen = new Set<string>();
  const outputOnly: OutputOnlyBoundary[] = [];
  for (const scenario of bundle.scenarios) {
    for (const expectation of scenario.expectations ?? []) {
      if (expectation.kind !== 'stub') continue;
      const parsed = parseBoundaryRef(expectation.ref);
      if (!parsed) continue;
      const key = `${parsed.category}:${parsed.key}`;
      if (fixtureKeys.has(key) || outputOnlySeen.has(key)) continue;
      outputOnlySeen.add(key);
      outputOnly.push({ id: `output:${key}`, category: parsed.category, key: parsed.key, note: expectation.note });
    }
  }

  return {
    programName: bundle.program_name,
    seed: bundle.seed,
    groups: groupOrder.map((key) => groups.get(key)!),
    outputOnly,
    unresolved: bundle.unresolved,
  };
}

const DIRECTION_BADGES: Record<BoundaryNode['direction'], string> = {
  IN: '→ IN',
  OUT: '← OUT',
  BIDIRECTIONAL: '↔ BIDI',
  STATUS_ONLY: 'STATUS',
  '': '', // CALL/DYNCALL: no statement-level direction (see bundleTypes.ts)
};

// The tree row's description: direction badge plus the first layout field.
// fetchBundle casts the CLI's JSON without runtime validation, so a direction
// outside the declared union degrades to "no badge" rather than rendering
// the literal string "undefined".
export function boundaryDescription(boundary: BoundaryNode): string {
  const badge = DIRECTION_BADGES[boundary.direction] ?? '';
  const first = boundary.layout[0];
  if (!first) return badge;
  const picture = first.picture ? ` PIC ${first.picture}` : '';
  return badge ? `${badge} · ${first.name}${picture}` : `${first.name}${picture}`;
}

// One '--placeholder' 'CATEGORY:KEY' pair per unseeded boundary, in view-model order.
export function placeholderArgs(model: BoundariesViewModel): string[] {
  const args: string[] = [];
  for (const group of model.groups) {
    for (const boundary of group.boundaries) {
      if (!boundary.seeded) {
        args.push('--placeholder', `${boundary.category}:${boundary.key}`);
      }
    }
  }
  return args;
}

// Only non-default (seeded === false) entries are persisted.
export function toSeededOverrides(model: BoundariesViewModel): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  for (const group of model.groups) {
    for (const boundary of group.boundaries) {
      if (!boundary.seeded) {
        overrides[boundary.id] = false;
      }
    }
  }
  return overrides;
}
