import assert from 'node:assert/strict';
import { fieldNodeId, groupNodeId, unresolvedItemNodeId } from './treeNodeIds';
import type { BundleFieldSpec } from './bundleTypes';

describe('fieldNodeId', () => {
  it('disambiguates OCCURS-backed fields that share a name via their unique column', () => {
    // Two occurrences of the same OCCURS item: cobol-parser gives them
    // identical `.name` but distinct `.column` (e.g. "ITEM-CODE(1)" /
    // "ITEM-CODE(2)").
    const occurrence1: BundleFieldSpec = {
      name: 'ITEM-CODE',
      column: 'ITEM-CODE(1)',
      picture: 'X(5)',
      usage: 'DISPLAY',
      category: 'alphanumeric',
    };
    const occurrence2: BundleFieldSpec = {
      name: 'ITEM-CODE',
      column: 'ITEM-CODE(2)',
      picture: 'X(5)',
      usage: 'DISPLAY',
      category: 'alphanumeric',
    };
    const boundaryId = 'MAIN-PARA/READ:ITEM-FILE';

    // The bug this guards against: building the id from `.name` instead of
    // `.column` would collapse these two onto the same TreeItem id.
    assert.equal(occurrence1.name, occurrence2.name);
    assert.notEqual(
      fieldNodeId(boundaryId, occurrence1.column),
      fieldNodeId(boundaryId, occurrence2.column)
    );
  });

  it('embeds the boundary id and column verbatim', () => {
    assert.equal(fieldNodeId('P/READ:F', 'ITEM-CODE(1)'), 'P/READ:F#field:ITEM-CODE(1)');
  });
});

describe('groupNodeId', () => {
  it('namespaces the paragraph name', () => {
    assert.equal(groupNodeId('MAIN-PARA'), 'group:MAIN-PARA');
  });
});

describe('unresolvedItemNodeId', () => {
  it('namespaces the index', () => {
    assert.equal(unresolvedItemNodeId(2), 'unresolved:2');
  });
});
