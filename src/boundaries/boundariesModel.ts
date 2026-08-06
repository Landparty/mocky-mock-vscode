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

export interface ParagraphGroup {
  paragraph: string;
  boundaries: BoundaryNode[];
}

export interface BoundariesViewModel {
  programName: string | null;
  seed: number;
  groups: ParagraphGroup[];
  unresolved: string[];
}

function boundaryId(paragraph: string | null, category: string, key: string): string {
  return `${paragraph ?? PROGRAM_GROUP}/${category}:${key}`;
}

// Dedupes boundaries across scenarios by (paragraph, category, key), keeping
// the first-seen fixture (its layout/line win) in first-seen order, then
// groups by paragraph (null paragraph groups under '(program)').
export function buildViewModel(
  bundle: FixtureBundle,
  seededOverrides: Record<string, boolean>
): BoundariesViewModel {
  const seen = new Set<string>();
  const groupOrder: string[] = [];
  const groups = new Map<string, ParagraphGroup>();

  for (const scenario of bundle.scenarios) {
    for (const fixture of scenario.fixtures) {
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

  return {
    programName: bundle.program_name,
    seed: bundle.seed,
    groups: groupOrder.map((key) => groups.get(key)!),
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
