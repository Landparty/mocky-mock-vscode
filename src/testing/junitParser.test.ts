import * as assert from 'assert';
import { parseJUnitXml } from './junitParser';

describe('parseJUnitXml', () => {
  it('parses a clean all-passed suite', () => {
    const xml = `<?xml version="1.0" ?>
<testsuite name="INVUPDT all boundary categories" tests="1" failures="0" errors="0">
  <testcase name="totals two records then updates and notifies"/>
</testsuite>`;

    const suite = parseJUnitXml(xml);

    assert.ok(suite);
    assert.strictEqual(suite.name, 'INVUPDT all boundary categories');
    assert.strictEqual(suite.tests, 1);
    assert.strictEqual(suite.cases.length, 1);
    assert.deepStrictEqual(suite.cases[0], {
      name: 'totals two records then updates and notifies',
      status: 'passed',
      messages: [],
    });
  });

  it('parses passed, failed-with-multiple-reasons, crashed, and orphan cases', () => {
    const xml = `<?xml version="1.0" ?>
<testsuite name="suite" tests="3" failures="1" errors="2">
  <testcase name="case-pass"/>
  <testcase name="case-fail">
    <failure message="expected WS-TOTAL-QTY to be 10, got 8"/>
    <failure message="VERIFY READ INV-FILE WAS PERFORMED 3 TIMES: got 2"/>
  </testcase>
  <testcase name="case-crash">
    <error message="binary exited with code 139"/>
  </testcase>
  <testcase name="orphan-7">
    <error message="FAIL for unknown case id 7"/>
  </testcase>
</testsuite>`;

    const suite = parseJUnitXml(xml);

    assert.ok(suite);
    assert.strictEqual(suite.cases.length, 4);
    assert.deepStrictEqual(suite.cases[0], { name: 'case-pass', status: 'passed', messages: [] });
    assert.deepStrictEqual(suite.cases[1], {
      name: 'case-fail',
      status: 'failed',
      messages: [
        'expected WS-TOTAL-QTY to be 10, got 8',
        'VERIFY READ INV-FILE WAS PERFORMED 3 TIMES: got 2',
      ],
    });
    assert.deepStrictEqual(suite.cases[2], {
      name: 'case-crash',
      status: 'errored',
      messages: ['binary exited with code 139'],
    });
    assert.deepStrictEqual(suite.cases[3], {
      name: 'orphan-7',
      status: 'errored',
      messages: ['FAIL for unknown case id 7'],
    });
  });

  it('returns null for malformed XML instead of throwing', () => {
    assert.strictEqual(parseJUnitXml('<testsuite name="x"><testcase'), null);
  });

  it('returns null for a document with no testsuite, instead of an empty suite', () => {
    // An empty suite here used to make mapResults report every case as
    // "did not run — an earlier case in this suite crashed".
    assert.strictEqual(parseJUnitXml('<unrelated/>'), null);
  });

  it('unwraps a <testsuites> wrapper root to its first suite', () => {
    const xml = `<testsuites><testsuite name="wrapped" tests="1">
  <testcase name="a"/>
</testsuite></testsuites>`;
    const suite = parseJUnitXml(xml);
    assert.ok(suite);
    assert.strictEqual(suite.name, 'wrapped');
    assert.strictEqual(suite.cases[0].name, 'a');
  });
});
