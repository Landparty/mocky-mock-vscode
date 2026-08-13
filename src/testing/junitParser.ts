import { XMLParser } from 'fast-xml-parser';

export interface JUnitTestCase {
  name: string;
  status: 'passed' | 'failed' | 'errored';
  messages: string[];
}

export interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  cases: JUnitTestCase[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function extractMessages(node: unknown): string[] {
  return asArray(node as any).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj['#text'] === 'string') return obj['#text'] as string;
    }
    return '';
  });
}

// Returns null (letting the caller fall back to the process-output message)
// instead of throwing or fabricating an empty suite:
//  - malformed XML (a truncated report from a killed container) used to
//    throw out of the caller and error the whole file with a raw parser
//    message;
//  - a document with no <testsuite> at all used to yield an EMPTY suite,
//    which mapResults then reported as every case "did not run — an earlier
//    case crashed" -- a confident, wrong diagnosis.
// A <testsuites> wrapper root (the more common JUnit shape) is unwrapped to
// its first <testsuite> -- mockymock runs exactly one suite per invocation.
export function parseJUnitXml(xml: string): JUnitTestSuite | null {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  const suiteNode = doc.testsuite ?? asArray(doc.testsuites?.testsuite)[0];
  if (suiteNode === undefined) return null;
  const rawCases = asArray(suiteNode.testcase);

  const cases: JUnitTestCase[] = rawCases.map((tc: any) => {
    if (tc.failure !== undefined) {
      return { name: tc.name, status: 'failed' as const, messages: extractMessages(tc.failure) };
    }
    if (tc.error !== undefined) {
      return { name: tc.name, status: 'errored' as const, messages: extractMessages(tc.error) };
    }
    return { name: tc.name, status: 'passed' as const, messages: [] };
  });

  return {
    name: suiteNode.name ?? '',
    tests: Number(suiteNode.tests ?? cases.length),
    failures: Number(suiteNode.failures ?? 0),
    errors: Number(suiteNode.errors ?? 0),
    cases,
  };
}
