// Mirrors cobol-parser docs/fixture-bundle-schema.md (bundle_version 1),
// restricted to the keys this extension reads.

export type ScenarioMode = 'happy' | 'branches' | 'all';

export interface BundleFieldSpec {
  name: string;
  column: string;
  picture: string | null;
  usage: string;
  category: string;
}

export interface BundleFixture {
  category: string;
  key: string;
  paragraph: string | null;
  line: number | null;
  direction: 'IN' | 'OUT' | 'BIDIRECTIONAL' | 'STATUS_ONLY';
  layout: BundleFieldSpec[];
  sequence: Record<string, string>[];
  terminal: Record<string, string> | null;
  status: Record<string, string>;
  unresolved: string[];
}

export interface BundleScenario {
  name: string;
  intent: string;
  entry: string | null;
  fixtures: BundleFixture[];
}

export interface FixtureBundle {
  bundle_version: number;
  program_name: string | null;
  seed: number;
  scenarios: BundleScenario[];
  unresolved: string[];
}
