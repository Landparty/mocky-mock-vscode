import assert from 'node:assert/strict';
import { buildViewModel, placeholderArgs, toSeededOverrides } from './boundariesModel';
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
