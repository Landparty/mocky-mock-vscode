import assert from 'node:assert/strict';
import { buildViewModel, boundaryDescription, placeholderArgs, toSeededOverrides } from './boundariesModel';
import type { BoundaryNode } from './boundariesModel';
import type { FixtureBundle } from './bundleTypes';

const bundle: FixtureBundle = {
  bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: ['COPY MISSING'],
  scenarios: [
    { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [
      { category: 'OPEN', key: 'ORDER-FILE', paragraph: 'MAIN-PARA', line: 18,
        direction: 'STATUS_ONLY', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
      { category: 'READ', key: 'ORDER-FILE', paragraph: 'MAIN-PARA', line: 19,
        direction: 'IN', layout: [{ name: 'ORDER-QTY', column: 'ORDER-QTY', picture: '9(3)', usage: 'DISPLAY', category: 'numeric' }],
        sequence: [{ 'ORDER-QTY': '50' }], terminal: null, status: {}, unresolved: [] },
    ] },
    // second scenario repeats the same boundaries — must dedupe
    { name: 'CHECK: THEN', intent: '', entry: 'MAIN-PARA', fixtures: [
      { category: 'READ', key: 'ORDER-FILE', paragraph: 'MAIN-PARA', line: 19,
        direction: 'IN', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
    ] },
  ],
};

describe('buildViewModel', () => {
  it('dedupes boundaries across scenarios and groups by paragraph', () => {
    const m = buildViewModel(bundle, {});
    assert.equal(m.groups.length, 1);
    assert.deepEqual(m.groups[0].boundaries.map((b) => b.id),
      ['MAIN-PARA/OPEN:ORDER-FILE', 'MAIN-PARA/READ:ORDER-FILE']);
  });
  it('defaults seeded=true and applies overrides', () => {
    const m = buildViewModel(bundle, { 'MAIN-PARA/READ:ORDER-FILE': false });
    assert.deepEqual(m.groups[0].boundaries.map((b) => b.seeded), [true, false]);
  });
  it('surfaces bundle-level unresolved entries', () => {
    assert.deepEqual(buildViewModel(bundle, {}).unresolved, ['COPY MISSING']);
  });
});

describe('buildViewModel paragraph grouping', () => {
  it('groups a null-paragraph fixture under \'(program)\', keeping BoundaryNode.paragraph as null', () => {
    const withProgramLevel: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [
          { category: 'CALL', key: 'SUBPROG', paragraph: null, line: 5,
            direction: 'IN', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
        ] },
      ],
    };
    const m = buildViewModel(withProgramLevel, {});
    assert.equal(m.groups.length, 1);
    assert.equal(m.groups[0].paragraph, '(program)');
    assert.equal(m.groups[0].boundaries[0].id, '(program)/CALL:SUBPROG');
    assert.equal(m.groups[0].boundaries[0].paragraph, null);
  });

  it('creates one group per distinct paragraph, in first-seen order', () => {
    // The WRITE fixture below is synthetic for this grouping test only --
    // in a real bundle, cobol-parser never emits a BoundaryFixture at all
    // for an OUT-direction boundary (see the 'output-only boundaries'
    // describe block below), so this exact shape can't occur from a real
    // `mockymock fixtures` run. buildViewModel must still group whatever
    // fixtures it's given, defensively.
    const twoParagraphs: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [
          { category: 'READ', key: 'ORDER-FILE', paragraph: 'MAIN-PARA', line: 19,
            direction: 'IN', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
          { category: 'WRITE', key: 'LOG-FILE', paragraph: 'CLEANUP-PARA', line: 40,
            direction: 'OUT', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
        ] },
      ],
    };
    const m = buildViewModel(twoParagraphs, {});
    assert.deepEqual(m.groups.map((g) => g.paragraph), ['MAIN-PARA', 'CLEANUP-PARA']);
  });
});

describe('buildViewModel output-only boundaries', () => {
  // Real shape: cobol-parser's ProgramFixtureGenerator never emits a
  // BoundaryFixture for an OUT-direction boundary (WRITE/REWRITE, an SQL
  // INSERT/UPDATE/DELETE) -- it emits a kind="stub" Expectation with
  // ref="CATEGORY:KEY" instead, and no fixture at all. This is how those
  // boundaries actually reach the extension.
  it('recovers a WRITE boundary that has no fixture, from its stub expectation', () => {
    const writeOnly: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [],
          expectations: [
            { kind: 'stub', ref: 'WRITE:LOG-FILE', value: null, note: 'value produced by the program under test' },
          ] },
      ],
    };
    const m = buildViewModel(writeOnly, {});
    assert.equal(m.groups.length, 0);
    assert.deepEqual(m.outputOnly, [
      { id: 'output:WRITE:LOG-FILE', category: 'WRITE', key: 'LOG-FILE', note: 'value produced by the program under test' },
    ]);
  });

  it('dedupes the same stub ref repeated across scenarios', () => {
    const repeated: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [],
          expectations: [{ kind: 'stub', ref: 'WRITE:LOG-FILE', value: null, note: null }] },
        { name: 'CHECK: THEN', intent: '', entry: 'MAIN-PARA', fixtures: [],
          expectations: [{ kind: 'stub', ref: 'WRITE:LOG-FILE', value: null, note: null }] },
      ],
    };
    assert.equal(buildViewModel(repeated, {}).outputOnly.length, 1);
  });

  it('excludes a stub ref that already has a real, fixture-derived boundary (a BIDIRECTIONAL "OUT aspect" stub)', () => {
    const bidi: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [
            { category: 'CICS', key: 'ORDER-MAP', paragraph: 'MAIN-PARA', line: 30,
              direction: 'BIDIRECTIONAL', layout: [], sequence: [], terminal: null, status: {}, unresolved: [] },
          ],
          expectations: [
            { kind: 'stub', ref: 'CICS:ORDER-MAP', value: null, note: 'bidirectional: OUT aspect not asserted in v1' },
          ] },
      ],
    };
    const m = buildViewModel(bidi, {});
    assert.equal(m.groups[0].boundaries.length, 1);
    assert.deepEqual(m.outputOnly, []);
  });

  it('ignores a bare CALL-argument stub ref (no colon) and a non-stub expectation kind', () => {
    const notBoundaryLevel: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [
        { name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [],
          expectations: [
            { kind: 'stub', ref: 'WS-RESULT', value: null, note: 'value supplied by the program under test' },
            { kind: 'call_count', ref: 'READ:ORDER-FILE', value: 1, note: null },
          ] },
      ],
    };
    assert.deepEqual(buildViewModel(notBoundaryLevel, {}).outputOnly, []);
  });

  it('treats a bundle with no expectations field at all the same as an empty array (older-CLI compatibility)', () => {
    const noExpectations: FixtureBundle = {
      bundle_version: 1, program_name: 'WDTEST', seed: 7, unresolved: [],
      scenarios: [{ name: 'happy path', intent: '', entry: 'MAIN-PARA', fixtures: [] }],
    };
    assert.deepEqual(buildViewModel(noExpectations, {}).outputOnly, []);
  });
});

describe('boundaryDescription', () => {
  const node = (overrides: Partial<BoundaryNode>): BoundaryNode => ({
    id: 'MAIN-PARA/READ:ORDER-FILE', category: 'READ', key: 'ORDER-FILE',
    paragraph: 'MAIN-PARA', line: 19, direction: 'IN',
    layout: [{ name: 'ORDER-QTY', column: 'ORDER-QTY', picture: '9(3)', usage: 'DISPLAY', category: 'numeric' }],
    seeded: true,
    ...overrides,
  });

  it('renders the direction badge and the first layout field', () => {
    assert.equal(boundaryDescription(node({})), '→ IN · ORDER-QTY PIC 9(3)');
  });

  it('renders just the badge when the boundary has no layout', () => {
    assert.equal(boundaryDescription(node({ layout: [] })), '→ IN');
  });

  // Real CLI behavior: CALL/DYNCALL boundaries carry direction "" (the
  // direction lives per-argument upstream; boundary_inventory.py emits no
  // statement-level direction). The row must not render "undefined".
  it('renders a CALL boundary with empty direction as the field alone, badge omitted', () => {
    const call = node({
      id: '(program)/CALL:LOGALERT', category: 'CALL', key: 'LOGALERT',
      paragraph: null, line: 12, direction: '',
      layout: [{ name: 'WS-ALERT-STATUS', column: 'WS-ALERT-STATUS', picture: 'X(2)', usage: 'DISPLAY', category: 'alphanumeric' }],
    });
    assert.equal(boundaryDescription(call), 'WS-ALERT-STATUS PIC X(2)');
  });

  it('renders an empty description for an empty-direction boundary with no layout', () => {
    const call = node({
      id: '(program)/CALL:LOGALERT', category: 'CALL', key: 'LOGALERT',
      paragraph: null, direction: '', layout: [],
    });
    assert.equal(boundaryDescription(call), '');
  });
});

describe('placeholderArgs / toSeededOverrides', () => {
  it('emits one --placeholder per unseeded boundary', () => {
    const m = buildViewModel(bundle, { 'MAIN-PARA/READ:ORDER-FILE': false });
    assert.deepEqual(placeholderArgs(m), ['--placeholder', 'READ:ORDER-FILE']);
  });
  it('round-trips overrides (only false entries persisted)', () => {
    const m = buildViewModel(bundle, { 'MAIN-PARA/READ:ORDER-FILE': false });
    assert.deepEqual(toSeededOverrides(m), { 'MAIN-PARA/READ:ORDER-FILE': false });
    assert.deepEqual(toSeededOverrides(buildViewModel(bundle, {})), {});
  });
});
