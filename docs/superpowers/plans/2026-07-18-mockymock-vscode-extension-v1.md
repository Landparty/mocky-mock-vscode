# mockymock VS Code Extension v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VS Code extension that runs `mockymock` `.cut` test suites against COBOL programs via VS Code's native Test Explorer, with automatic environment bootstrap (installs the `mockymock` CLI, launches Docker Desktop) so the day-to-day loop never requires a terminal.

**Architecture:** A thin TypeScript orchestrator around the existing `mockymock` Python CLI. Pure-logic modules (`.cut` parsing, JUnit XML parsing, result mapping, environment decision functions) have no dependency on the `vscode` module and are unit tested directly with Mocha + ts-node. VS Code-API-dependent glue (the Test Controller, the Environment Manager's UI/orchestration) wires those pure modules together and is verified manually via the Extension Development Host, per the approved design spec.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.tests` Testing API), Node `child_process`, `fast-xml-parser` for JUnit XML, Mocha + ts-node for unit tests, `@vscode/vsce` for packaging.

## Global Constraints

- Distribution is a locally built `.vsix` only (`vsce package` + "Install from VSIX") — no Marketplace publishing in v1.
- `mockymock` CLI resolution: PATH first, overridable via the `mockymock.executablePath` setting.
- Copybook resolution: `mockymock.copybookPaths` setting (array of folder paths), one `--copybook-path` flag emitted per path.
- `.cut` → `.cbl` discovery is same-filename-stem, same-directory only — no pragma comment, no cross-file mapping setting.
- `mockymock run` only executes a whole suite in one compile + binary run (no single-case invocation) — any run request must run the entire containing `.cut` file.
- Docker Desktop's own installation is never silently automated — only launching an already-installed-but-stopped Docker Desktop, and installing the `mockymock` CLI itself via `uv`, are automated. A missing Docker Desktop install gets a one-click prompt, never a silent background install.
- Out of scope for v1 (do not build): `.cut` syntax highlighting/snippets/`generate` command, coverage-report integration, debug-mode runs.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.mocharc.json`
- Create: `.gitignore`
- Create: `.vscodeignore`
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`
- Create: `src/extension.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `activate(context: vscode.ExtensionContext): void` and `deactivate(): void` in `src/extension.ts`, which Task 8 will replace with real wiring. `npm run compile` producing `out/extension.js`. `npm run test:unit` running Mocha against `src/**/*.test.ts`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "mockymock-vscode",
  "displayName": "mockymock",
  "description": "Run mockymock .cut COBOL test suites directly from VS Code.",
  "version": "0.0.1",
  "publisher": "legacylens",
  "private": true,
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Testing"],
  "activationEvents": [
    "workspaceContains:**/*.cut"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "configuration": {
      "title": "mockymock",
      "properties": {
        "mockymock.executablePath": {
          "type": "string",
          "default": "",
          "description": "Path to the mockymock executable. Leave empty to resolve 'mockymock' from PATH."
        },
        "mockymock.copybookPaths": {
          "type": "array",
          "items": { "type": "string" },
          "default": [],
          "description": "Folder paths passed as --copybook-path on every mockymock run, for resolving COPY / EXEC SQL INCLUDE members."
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test:unit": "mocha",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.24.0",
    "mocha": "^10.3.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "fast-xml-parser": "^4.3.4"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "out", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write `.mocharc.json`**

```json
{
  "require": ["ts-node/register"],
  "extension": ["ts"],
  "spec": "src/**/*.test.ts",
  "timeout": 5000
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
out/
*.vsix
```

- [ ] **Step 5: Write `.vscodeignore`**

```
src/**
**/*.test.ts
.vscode/**
.mocharc.json
tsconfig.json
docs/**
**/*.map
.gitignore
```

- [ ] **Step 6: Write `.vscode/tasks.json`**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "compile",
      "label": "npm: compile",
      "group": { "kind": "build", "isDefault": true },
      "problemMatcher": ["$tsc"]
    }
  ]
}
```

- [ ] **Step 7: Write `.vscode/launch.json`**

This points the Extension Development Host at the `mocky-mock` repo's own worked
example (a sibling directory, per this workspace's layout), so pressing F5
throughout development opens directly onto real `.cut`/`.cbl` files.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "${workspaceFolder}/../mocky-mock/examples/invupdt"
      ],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

- [ ] **Step 8: Write the minimal `src/extension.ts` stub**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('mockymock extension activated');
}

export function deactivate() {}
```

- [ ] **Step 9: Install dependencies and compile**

Run: `npm install`
Expected: installs without error, creates `node_modules/` and `package-lock.json`.

Run: `npm run compile`
Expected: exits 0, creates `out/extension.js`.

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json .mocharc.json .gitignore .vscodeignore .vscode/launch.json .vscode/tasks.json src/extension.ts package-lock.json
git commit -m "chore: scaffold VS Code extension project"
```

---

### Task 2: `.cut` file parsing (`cutDiscovery.ts`)

**Files:**
- Create: `src/discovery/cutDiscovery.ts`
- Test: `src/discovery/cutDiscovery.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCutFile(text: string): CutSuite[]` and `resolveCblPath(cutFilePath: string): string`, where `CutSuite = { name: string; line: number; cases: CutCase[] }` and `CutCase = { name: string; line: number }`. Task 8 imports both.

- [ ] **Step 1: Write the failing tests**

```ts
// src/discovery/cutDiscovery.test.ts
import * as assert from 'assert';
import * as path from 'path';
import { parseCutFile, resolveCblPath } from './cutDiscovery';

describe('parseCutFile', () => {
  it('parses a single suite with multiple cases', () => {
    const text = [
      'TESTSUITE "INVUPDT all boundary categories"',
      '',
      'TESTCASE "totals two records then updates and notifies"',
      '    MOCK OPEN INV-FILE',
      '    END-MOCK',
      'TESTCASE "handles empty file"',
      '    MOCK OPEN INV-FILE',
      '    END-MOCK',
    ].join('\n');

    const suites = parseCutFile(text);

    assert.strictEqual(suites.length, 1);
    assert.strictEqual(suites[0].name, 'INVUPDT all boundary categories');
    assert.strictEqual(suites[0].line, 0);
    assert.strictEqual(suites[0].cases.length, 2);
    assert.strictEqual(suites[0].cases[0].name, 'totals two records then updates and notifies');
    assert.strictEqual(suites[0].cases[0].line, 2);
    assert.strictEqual(suites[0].cases[1].name, 'handles empty file');
    assert.strictEqual(suites[0].cases[1].line, 5);
  });

  it('ignores commented-out lines', () => {
    const text = ['TESTSUITE "s"', '*> TESTCASE "not real"', 'TESTCASE "real"'].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases.length, 1);
    assert.strictEqual(suites[0].cases[0].name, 'real');
  });

  it('starts a new suite on a second TESTSUITE line', () => {
    const text = ['TESTSUITE "a"', 'TESTCASE "1"', 'TESTSUITE "b"', 'TESTCASE "2"'].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites.length, 2);
    assert.strictEqual(suites[0].cases.length, 1);
    assert.strictEqual(suites[1].cases.length, 1);
  });

  it('returns no suites for text with no TESTSUITE line', () => {
    const suites = parseCutFile('*> just a comment\n');
    assert.strictEqual(suites.length, 0);
  });
});

describe('resolveCblPath', () => {
  it('swaps the .cut extension for .cbl in the same directory', () => {
    const cutPath = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cut');
    const expected = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cbl');
    assert.strictEqual(resolveCblPath(cutPath), expected);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './cutDiscovery'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/discovery/cutDiscovery.ts
import * as path from 'path';

export interface CutCase {
  name: string;
  line: number;
}

export interface CutSuite {
  name: string;
  line: number;
  cases: CutCase[];
}

const TESTSUITE_RE = /^\s*TESTSUITE\s+"([^"]*)"/;
const TESTCASE_RE = /^\s*TESTCASE\s+"([^"]*)"/;

export function parseCutFile(text: string): CutSuite[] {
  const lines = text.split(/\r\n|\n/);
  const suites: CutSuite[] = [];
  let current: CutSuite | null = null;

  lines.forEach((line, index) => {
    const suiteMatch = TESTSUITE_RE.exec(line);
    if (suiteMatch) {
      current = { name: suiteMatch[1], line: index, cases: [] };
      suites.push(current);
      return;
    }
    const caseMatch = TESTCASE_RE.exec(line);
    if (caseMatch && current) {
      current.cases.push({ name: caseMatch[1], line: index });
    }
  });

  return suites;
}

export function resolveCblPath(cutFilePath: string): string {
  const parsed = path.parse(cutFilePath);
  return path.join(parsed.dir, `${parsed.name}.cbl`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/discovery/cutDiscovery.ts src/discovery/cutDiscovery.test.ts
git commit -m "feat: parse TESTSUITE/TESTCASE names from .cut files"
```

---

### Task 3: JUnit XML parsing (`junitParser.ts`)

**Files:**
- Create: `src/testing/junitParser.ts`
- Test: `src/testing/junitParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseJUnitXml(xml: string): JUnitTestSuite`, where `JUnitTestSuite = { name: string; tests: number; failures: number; errors: number; cases: JUnitTestCase[] }` and `JUnitTestCase = { name: string; status: 'passed' | 'failed' | 'errored'; messages: string[] }`. Task 4 (`resultMapper.ts`) and Task 8 (`testController.ts`) both import `JUnitTestSuite`/`JUnitTestCase` and call `parseJUnitXml`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/testing/junitParser.test.ts
import * as assert from 'assert';
import { parseJUnitXml } from './junitParser';

describe('parseJUnitXml', () => {
  it('parses a clean all-passed suite', () => {
    const xml = `<?xml version="1.0" ?>
<testsuite name="INVUPDT all boundary categories" tests="1" failures="0" errors="0">
  <testcase name="totals two records then updates and notifies"/>
</testsuite>`;

    const suite = parseJUnitXml(xml);

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './junitParser'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/testing/junitParser.ts
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

export function parseJUnitXml(xml: string): JUnitTestSuite {
  const doc = parser.parse(xml);
  const suiteNode = doc.testsuite ?? {};
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/testing/junitParser.ts src/testing/junitParser.test.ts package.json package-lock.json
git commit -m "feat: parse mockymock's JUnit XML output"
```

---

### Task 4: Result mapping (`resultMapper.ts`)

**Files:**
- Create: `src/testing/resultMapper.ts`
- Test: `src/testing/resultMapper.test.ts`

**Interfaces:**
- Consumes: `JUnitTestSuite`/`JUnitTestCase` from `./junitParser` (Task 3).
- Produces: `mapResults(expectedCaseNames: string[], junitSuite: JUnitTestSuite | null, processFailureMessage?: string): Map<string, CaseOutcome>`, where `CaseOutcome = { kind: 'passed' } | { kind: 'failed'; message: string } | { kind: 'errored'; message: string } | { kind: 'not-run'; message: string }`. Task 8 imports `mapResults` and `CaseOutcome`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/testing/resultMapper.test.ts
import * as assert from 'assert';
import { mapResults } from './resultMapper';
import { JUnitTestSuite } from './junitParser';

describe('mapResults', () => {
  it('marks a case passed when junit reports no failure/error child', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 0,
      cases: [{ name: 'case-a', status: 'passed', messages: [] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'passed' });
  });

  it('carries failure messages through, joined by newline, for a failed case', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 1, errors: 0,
      cases: [{ name: 'case-a', status: 'failed', messages: ['expected 10 got 8', 'second reason'] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'failed',
      message: 'expected 10 got 8\nsecond reason',
    });
  });

  it('carries an error message through for a crashed case', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 1,
      cases: [{ name: 'case-a', status: 'errored', messages: ['binary exited with code 139'] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'errored', message: 'binary exited with code 139' });
  });

  it('marks a case not present in the junit output as not-run', () => {
    const suite: JUnitTestSuite = { name: 's', tests: 0, failures: 0, errors: 0, cases: [] };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'not-run',
      message: 'did not run — an earlier case in this suite crashed',
    });
  });

  it('marks every expected case errored when no junit xml was produced at all', () => {
    const outcomes = mapResults(['case-a', 'case-b'], null, 'PARSE_WARNING: dropped statement');
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'errored', message: 'PARSE_WARNING: dropped statement' });
    assert.deepStrictEqual(outcomes.get('case-b'), { kind: 'errored', message: 'PARSE_WARNING: dropped statement' });
  });

  it('falls back to a generic message when no junit xml and no process message given', () => {
    const outcomes = mapResults(['case-a'], null);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'errored',
      message: 'mockymock run did not produce results (refused or failed to compile)',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './resultMapper'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/testing/resultMapper.ts
import { JUnitTestSuite } from './junitParser';

export type CaseOutcome =
  | { kind: 'passed' }
  | { kind: 'failed'; message: string }
  | { kind: 'errored'; message: string }
  | { kind: 'not-run'; message: string };

export function mapResults(
  expectedCaseNames: string[],
  junitSuite: JUnitTestSuite | null,
  processFailureMessage?: string
): Map<string, CaseOutcome> {
  const outcomes = new Map<string, CaseOutcome>();

  if (!junitSuite) {
    const message = processFailureMessage ?? 'mockymock run did not produce results (refused or failed to compile)';
    for (const name of expectedCaseNames) {
      outcomes.set(name, { kind: 'errored', message });
    }
    return outcomes;
  }

  const byName = new Map(junitSuite.cases.map((c) => [c.name, c]));
  for (const name of expectedCaseNames) {
    const found = byName.get(name);
    if (!found) {
      outcomes.set(name, {
        kind: 'not-run',
        message: 'did not run — an earlier case in this suite crashed',
      });
      continue;
    }
    if (found.status === 'passed') {
      outcomes.set(name, { kind: 'passed' });
    } else {
      outcomes.set(name, {
        kind: found.status,
        message: found.messages.join('\n') || found.status,
      });
    }
  }
  return outcomes;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/testing/resultMapper.ts src/testing/resultMapper.test.ts
git commit -m "feat: map JUnit results onto expected test case names"
```

---

### Task 5: Environment decision functions (`commandRunner.ts`, `checks.ts`)

**Files:**
- Create: `src/environment/commandRunner.ts`
- Create: `src/environment/checks.ts`
- Test: `src/environment/checks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CommandResult = { code: number; stdout: string; stderr: string }`, `CommandRunner = (command: string, args: string[]) => Promise<CommandResult>`, and a real implementation `runCommand: CommandRunner` in `commandRunner.ts`. `checks.ts` produces `checkCommandAvailable(run: CommandRunner, executablePath: string, args: string[]): Promise<boolean>`, `checkDocker(run: CommandRunner): Promise<'available' | 'daemon-down' | 'not-installed'>`, `resolveExecutablePath(configuredPath: string | undefined): string`, and `getDockerDesktopLaunchCommand(platform: NodeJS.Platform): { command: string; args: string[] } | null`. Task 6 imports all of these; Task 7 imports `CommandRunner`/`CommandResult`.

- [ ] **Step 1: Write `commandRunner.ts` (no test — thin wrapper around `child_process.spawn`, exercised indirectly by manual verification in Task 6/9)**

```ts
// src/environment/commandRunner.ts
import { spawn } from 'child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(command, args, { shell: process.platform === 'win32' });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'command not found' });
      return;
    }
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => resolve({ code: -1, stdout, stderr: stderr || 'command not found' }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
};
```

- [ ] **Step 2: Write the failing tests for `checks.ts`**

```ts
// src/environment/checks.test.ts
import * as assert from 'assert';
import {
  checkCommandAvailable,
  checkDocker,
  resolveExecutablePath,
  getDockerDesktopLaunchCommand,
} from './checks';
import { CommandResult, CommandRunner } from './commandRunner';

function fakeRunner(result: CommandResult): CommandRunner {
  return async () => result;
}

describe('checkCommandAvailable', () => {
  it('returns true when the command exits 0', async () => {
    const ok = await checkCommandAvailable(fakeRunner({ code: 0, stdout: '', stderr: '' }), 'mockymock', ['--version']);
    assert.strictEqual(ok, true);
  });

  it('returns false when the command exits non-zero', async () => {
    const ok = await checkCommandAvailable(fakeRunner({ code: 1, stdout: '', stderr: 'boom' }), 'mockymock', ['--version']);
    assert.strictEqual(ok, false);
  });
});

describe('checkDocker', () => {
  it('returns available when docker info exits 0', async () => {
    const status = await checkDocker(fakeRunner({ code: 0, stdout: 'ok', stderr: '' }));
    assert.strictEqual(status, 'available');
  });

  it('returns not-installed when the docker binary cannot be spawned', async () => {
    const status = await checkDocker(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }));
    assert.strictEqual(status, 'not-installed');
  });

  it('returns daemon-down when docker runs but the daemon is unreachable', async () => {
    const status = await checkDocker(fakeRunner({ code: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }));
    assert.strictEqual(status, 'daemon-down');
  });
});

describe('resolveExecutablePath', () => {
  it('returns "mockymock" when unconfigured', () => {
    assert.strictEqual(resolveExecutablePath(undefined), 'mockymock');
    assert.strictEqual(resolveExecutablePath(''), 'mockymock');
    assert.strictEqual(resolveExecutablePath('   '), 'mockymock');
  });

  it('returns the configured path when set', () => {
    assert.strictEqual(resolveExecutablePath('/opt/mockymock/bin/mockymock'), '/opt/mockymock/bin/mockymock');
  });
});

describe('getDockerDesktopLaunchCommand', () => {
  it('returns a win32 launch command', () => {
    const launch = getDockerDesktopLaunchCommand('win32');
    assert.ok(launch);
    assert.match(launch!.command, /Docker Desktop\.exe/);
  });

  it('returns a darwin launch command', () => {
    assert.deepStrictEqual(getDockerDesktopLaunchCommand('darwin'), { command: 'open', args: ['-a', 'Docker'] });
  });

  it('returns null for an unsupported platform', () => {
    assert.strictEqual(getDockerDesktopLaunchCommand('aix' as NodeJS.Platform), null);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './checks'`.

- [ ] **Step 4: Write the implementation**

```ts
// src/environment/checks.ts
import { CommandRunner } from './commandRunner';

export async function checkCommandAvailable(
  run: CommandRunner,
  executablePath: string,
  args: string[]
): Promise<boolean> {
  const result = await run(executablePath, args);
  return result.code === 0;
}

export type DockerStatus = 'available' | 'daemon-down' | 'not-installed';

export async function checkDocker(run: CommandRunner): Promise<DockerStatus> {
  const result = await run('docker', ['info']);
  if (result.code === 0) return 'available';
  if (result.code === -1) return 'not-installed';
  return 'daemon-down';
}

export function resolveExecutablePath(configuredPath: string | undefined): string {
  return configuredPath && configuredPath.trim().length > 0 ? configuredPath.trim() : 'mockymock';
}

export interface LaunchCommand {
  command: string;
  args: string[];
}

export function getDockerDesktopLaunchCommand(platform: NodeJS.Platform): LaunchCommand | null {
  if (platform === 'win32') {
    return { command: '"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', args: [] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Docker'] };
  }
  if (platform === 'linux') {
    return { command: 'systemctl', args: ['start', 'docker'] };
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/environment/commandRunner.ts src/environment/checks.ts src/environment/checks.test.ts
git commit -m "feat: add environment readiness decision functions"
```

Note for later manual verification (Task 9): the `win32` Docker Desktop path
assumes the default install location. If Docker Desktop is installed
elsewhere on the actual test machine, `getDockerDesktopLaunchCommand` will
need its path adjusted — flag this explicitly during Task 9 rather than
guessing further now.

---

### Task 6: Environment Manager (bootstrap orchestration + status bar)

**Files:**
- Create: `src/environment/environmentManager.ts`

**Interfaces:**
- Consumes: `CommandRunner`, `runCommand` from `./commandRunner` (Task 5); `checkCommandAvailable`, `checkDocker`, `resolveExecutablePath`, `getDockerDesktopLaunchCommand` from `./checks` (Task 5).
- Produces: `class EnvironmentManager { constructor(context: vscode.ExtensionContext); ensureReady(): Promise<ReadyResult> }`, where `ReadyResult = { ok: boolean; message: string }`. Task 8 constructs one `EnvironmentManager` and calls `ensureReady()` before every suite run.

This class is VS Code-API-dependent (status bar, progress notifications,
external URL prompts) and is not unit tested — it is exercised manually as
part of Task 9's end-to-end verification, per the design spec's testing plan.

- [ ] **Step 1: Write `environmentManager.ts`**

```ts
// src/environment/environmentManager.ts
import * as vscode from 'vscode';
import { runCommand } from './commandRunner';
import {
  checkCommandAvailable,
  checkDocker,
  getDockerDesktopLaunchCommand,
  resolveExecutablePath,
} from './checks';

export interface ReadyResult {
  ok: boolean;
  message: string;
}

export class EnvironmentManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.name = 'mockymock';
    context.subscriptions.push(this.statusBarItem);
    this.setStatus('$(sync) mockymock: checking…');
    this.statusBarItem.show();
  }

  private setStatus(text: string, tooltip?: string) {
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip ?? text;
  }

  async ensureReady(): Promise<ReadyResult> {
    const executablePath = resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock').get<string>('executablePath')
    );

    const mockymockOk = await checkCommandAvailable(runCommand, executablePath, ['--version']);
    if (!mockymockOk) {
      const installed = await this.installMockymock();
      if (!installed) {
        this.setStatus('$(error) mockymock: CLI not found');
        return {
          ok: false,
          message: 'mockymock CLI is not installed and automatic install failed. See the mocky-mock README for manual install steps.',
        };
      }
    }

    const dockerStatus = await checkDocker(runCommand);
    if (dockerStatus === 'available') {
      this.setStatus('$(check) mockymock: ready');
      return { ok: true, message: 'ready' };
    }

    if (dockerStatus === 'daemon-down') {
      const started = await this.startDockerDesktopAndWait();
      if (started) {
        this.setStatus('$(check) mockymock: ready');
        return { ok: true, message: 'ready' };
      }
      this.setStatus('$(error) mockymock: Docker did not start');
      return {
        ok: false,
        message: 'Docker Desktop did not become ready within the timeout. Start it manually and try again.',
      };
    }

    this.setStatus('$(warning) mockymock: Docker not installed', 'Click to install Docker Desktop');
    this.promptInstallDocker();
    return { ok: false, message: 'Docker Desktop is not installed. Install it, then re-run the test.' };
  }

  private async installMockymock(): Promise<boolean> {
    this.setStatus('$(sync~spin) mockymock: installing CLI…');
    const uvOk = await checkCommandAvailable(runCommand, 'uv', ['--version']);
    if (!uvOk) {
      const choice = await vscode.window.showWarningMessage(
        'mockymock CLI is not installed, and uv (needed to install it) was not found either.',
        'Open uv install instructions'
      );
      if (choice) {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.astral.sh/uv/getting-started/installation/'));
      }
      return false;
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Installing mockymock CLI via uv…' },
      async () => {
        const result = await runCommand('uv', [
          'tool',
          'install',
          'git+https://github.com/samdion1994/mocky-mock.git',
        ]);
        if (result.code !== 0) {
          vscode.window.showErrorMessage(
            `mockymock install failed: ${result.stderr || result.stdout}. If this is a GitHub auth error, run "gh auth setup-git" and try again.`
          );
          return false;
        }
        return true;
      }
    );
  }

  private async startDockerDesktopAndWait(): Promise<boolean> {
    const launch = getDockerDesktopLaunchCommand(process.platform);
    if (!launch) {
      return false;
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Starting Docker Desktop…' },
      async () => {
        await runCommand(launch.command, launch.args);
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const status = await checkDocker(runCommand);
          if (status === 'available') {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return false;
      }
    );
  }

  private promptInstallDocker() {
    vscode.window
      .showWarningMessage('Docker Desktop is required to run mockymock tests and was not found.', 'Open Docker Desktop download page')
      .then((choice) => {
        if (choice) {
          vscode.env.openExternal(vscode.Uri.parse('https://www.docker.com/products/docker-desktop/'));
        }
      });
  }
}
```

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/environment/environmentManager.ts
git commit -m "feat: add EnvironmentManager for mockymock/Docker bootstrap"
```

(Manual verification of this class's actual behavior — installing a missing
CLI, launching a stopped Docker Desktop, prompting on a missing install — is
covered in Task 9, once Task 8 wires it into an actual test run.)

---

### Task 7: mockymock invocation (`mockymockRunner.ts`)

**Files:**
- Create: `src/testing/mockymockRunner.ts`
- Test: `src/testing/mockymockRunner.test.ts`

**Interfaces:**
- Consumes: `CommandRunner` from `../environment/commandRunner` (Task 5).
- Produces: `buildRunArgs(cblPath: string, cutPath: string, junitXmlPath: string, copybookPaths: string[]): string[]` and `runSuite(options: RunSuiteOptions, run: CommandRunner, readFileIfExists: (path: string) => Promise<string | null>): Promise<MockymockRunResult>`, where `RunSuiteOptions = { executablePath: string; cblPath: string; cutPath: string; junitXmlPath: string; copybookPaths: string[] }` and `MockymockRunResult = { exitCode: number; stdout: string; stderr: string; junitXml: string | null }`. Task 8 imports `runSuite` and both interfaces.

- [ ] **Step 1: Write the failing tests**

```ts
// src/testing/mockymockRunner.test.ts
import * as assert from 'assert';
import { buildRunArgs, runSuite } from './mockymockRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildRunArgs', () => {
  it('builds the base run invocation with no copybook paths', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', []);
    assert.deepStrictEqual(args, ['run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml']);
  });

  it('appends a --copybook-path flag per configured path', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', ['/copy/a', '/copy/b']);
    assert.deepStrictEqual(args, [
      'run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml',
      '--copybook-path', '/copy/a', '--copybook-path', '/copy/b',
    ]);
  });
});

describe('runSuite', () => {
  it('returns the parsed junit xml when the file was produced', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.strictEqual(cmd, 'mockymock');
      assert.ok(args.includes('run'));
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const result = await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => '<testsuite/>'
    );
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.junitXml, '<testsuite/>');
  });

  it('returns a null junitXml when the run refused before producing one', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 1, stdout: '', stderr: 'mockymock run: refused (PARSE_WARNING): ...' });
    const result = await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => null
    );
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.junitXml, null);
    assert.match(result.stderr, /refused/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './mockymockRunner'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/testing/mockymockRunner.ts
import { CommandRunner } from '../environment/commandRunner';

export function buildRunArgs(
  cblPath: string,
  cutPath: string,
  junitXmlPath: string,
  copybookPaths: string[]
): string[] {
  const args = ['run', cblPath, '--cut', cutPath, '--junit-xml', junitXmlPath];
  for (const p of copybookPaths) {
    args.push('--copybook-path', p);
  }
  return args;
}

export interface RunSuiteOptions {
  executablePath: string;
  cblPath: string;
  cutPath: string;
  junitXmlPath: string;
  copybookPaths: string[];
}

export interface MockymockRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  junitXml: string | null;
}

export async function runSuite(
  options: RunSuiteOptions,
  run: CommandRunner,
  readFileIfExists: (path: string) => Promise<string | null>
): Promise<MockymockRunResult> {
  const args = buildRunArgs(options.cblPath, options.cutPath, options.junitXmlPath, options.copybookPaths);
  const result = await run(options.executablePath, args);
  const junitXml = await readFileIfExists(options.junitXmlPath);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, junitXml };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/testing/mockymockRunner.ts src/testing/mockymockRunner.test.ts
git commit -m "feat: build and execute the mockymock run invocation"
```

---

### Task 8: Test Controller wiring + extension activation

**Files:**
- Modify: `src/extension.ts`
- Create: `src/testing/testController.ts`

**Interfaces:**
- Consumes: `parseCutFile`, `resolveCblPath` from `../discovery/cutDiscovery` (Task 2); `parseJUnitXml` from `./junitParser` (Task 3); `mapResults` from `./resultMapper` (Task 4); `runCommand` from `../environment/commandRunner` (Task 5); `EnvironmentManager` from `../environment/environmentManager` (Task 6); `runSuite` from `./mockymockRunner` (Task 7).
- Produces: `activateTestController(context: vscode.ExtensionContext, environmentManager: EnvironmentManager): vscode.TestController`, called from `activate()` in `src/extension.ts`. Nothing later depends on this — it is the final integration point.

This task is not unit tested — the Testing API only exists inside a real VS
Code extension host. It is verified manually in Task 9.

- [ ] **Step 1: Write `src/testing/testController.ts`**

```ts
// src/testing/testController.ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseCutFile, resolveCblPath } from '../discovery/cutDiscovery';
import { parseJUnitXml } from './junitParser';
import { mapResults } from './resultMapper';
import { runSuite } from './mockymockRunner';
import { runCommand } from '../environment/commandRunner';
import { EnvironmentManager } from '../environment/environmentManager';

export function activateTestController(
  context: vscode.ExtensionContext,
  environmentManager: EnvironmentManager
): vscode.TestController {
  const controller = vscode.tests.createTestController('mockymock', 'mockymock');
  context.subscriptions.push(controller);

  const fileItems = new Map<string, vscode.TestItem>();

  async function discoverAndBuild(uri: vscode.Uri) {
    let text: string;
    try {
      text = await fs.readFile(uri.fsPath, 'utf8');
    } catch {
      return;
    }
    const suites = parseCutFile(text);

    const fileItem = controller.createTestItem(uri.toString(), path.basename(uri.fsPath), uri);
    const suiteItems = suites.map((suite) => {
      const suiteItem = controller.createTestItem(`${uri.toString()}::${suite.name}`, suite.name, uri);
      suiteItem.range = new vscode.Range(suite.line, 0, suite.line, 0);
      const caseItems = suite.cases.map((c) => {
        const caseItem = controller.createTestItem(`${uri.toString()}::${suite.name}::${c.name}`, c.name, uri);
        caseItem.range = new vscode.Range(c.line, 0, c.line, 0);
        return caseItem;
      });
      suiteItem.children.replace(caseItems);
      return suiteItem;
    });
    fileItem.children.replace(suiteItems);

    fileItems.set(uri.toString(), fileItem);
    controller.items.add(fileItem);
  }

  function removeFile(uri: vscode.Uri) {
    controller.items.delete(uri.toString());
    fileItems.delete(uri.toString());
  }

  async function discoverAllCutFiles() {
    const uris = await vscode.workspace.findFiles('**/*.cut', '**/node_modules/**');
    await Promise.all(uris.map(discoverAndBuild));
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cut');
  context.subscriptions.push(watcher);
  watcher.onDidCreate(discoverAndBuild);
  watcher.onDidChange(discoverAndBuild);
  watcher.onDidDelete(removeFile);

  controller.resolveHandler = async (item) => {
    if (!item) {
      await discoverAllCutFiles();
    }
  };
  void discoverAllCutFiles();

  async function runOneFile(fileItem: vscode.TestItem, run: vscode.TestRun) {
    fileItem.children.forEach((suiteItem) => {
      run.started(suiteItem);
      suiteItem.children.forEach((caseItem) => run.started(caseItem));
    });
    run.started(fileItem);

    const ready = await environmentManager.ensureReady();
    if (!ready.ok) {
      fileItem.children.forEach((suiteItem) => {
        suiteItem.children.forEach((caseItem) => run.errored(caseItem, new vscode.TestMessage(ready.message)));
        run.errored(suiteItem, new vscode.TestMessage(ready.message));
      });
      run.errored(fileItem, new vscode.TestMessage(ready.message));
      return;
    }

    const cutPath = fileItem.uri!.fsPath;
    const cblPath = resolveCblPath(cutPath);
    const junitXmlPath = path.join(os.tmpdir(), `mockymock-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`);
    const config = vscode.workspace.getConfiguration('mockymock');
    const executablePath = config.get<string>('executablePath') || 'mockymock';
    const copybookPaths = config.get<string[]>('copybookPaths') ?? [];

    const result = await runSuite(
      { executablePath, cblPath, cutPath, junitXmlPath, copybookPaths },
      runCommand,
      async (p) => {
        try {
          return await fs.readFile(p, 'utf8');
        } catch {
          return null;
        }
      }
    );
    await fs.unlink(junitXmlPath).catch(() => undefined);

    const allCaseNames: string[] = [];
    fileItem.children.forEach((suiteItem) => {
      suiteItem.children.forEach((caseItem) => allCaseNames.push(caseItem.label));
    });

    const junitSuite = result.junitXml ? parseJUnitXml(result.junitXml) : null;
    const processFailureMessage = junitSuite
      ? undefined
      : `mockymock run did not produce results:\n${result.stderr || result.stdout}`;
    const outcomes = mapResults(allCaseNames, junitSuite, processFailureMessage);

    let fileAllPassed = true;
    fileItem.children.forEach((suiteItem) => {
      let suiteAllPassed = true;
      suiteItem.children.forEach((caseItem) => {
        const outcome = outcomes.get(caseItem.label);
        if (!outcome || outcome.kind === 'passed') {
          run.passed(caseItem);
        } else {
          suiteAllPassed = false;
          run.failed(caseItem, new vscode.TestMessage(outcome.message));
        }
      });
      if (suiteAllPassed) {
        run.passed(suiteItem);
      } else {
        fileAllPassed = false;
        run.failed(suiteItem, new vscode.TestMessage('one or more cases failed'));
      }
    });
    if (fileAllPassed) {
      run.passed(fileItem);
    } else {
      run.failed(fileItem, new vscode.TestMessage('one or more cases failed'));
    }
  }

  const runHandler = async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
    const run = controller.createTestRun(request);
    const requestedFileUris = new Set<string>();
    if (request.include) {
      for (const item of request.include) {
        if (item.uri) requestedFileUris.add(item.uri.toString());
      }
    } else {
      for (const uri of fileItems.keys()) requestedFileUris.add(uri);
    }

    for (const uriString of requestedFileUris) {
      if (token.isCancellationRequested) break;
      const fileItem = fileItems.get(uriString);
      if (fileItem) {
        await runOneFile(fileItem, run);
      }
    }
    run.end();
  };

  controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, runHandler, true);

  return controller;
}
```

- [ ] **Step 2: Replace `src/extension.ts` with the real activation wiring**

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
}

export function deactivate() {}
```

- [ ] **Step 3: Compile**

Run: `npm run compile`
Expected: exits 0. Fix any TypeScript errors surfaced by wiring the modules together before proceeding.

- [ ] **Step 4: Run the unit suite to confirm nothing else broke**

Run: `npm run test:unit`
Expected: PASS (same tests as Tasks 2-5, 7 — this task added no new unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/testing/testController.ts
git commit -m "feat: wire the Test Controller into extension activation"
```

---

### Task 9: End-to-end manual verification and packaging

**Files:**
- None created — this task exercises the extension built by Tasks 1-8 and produces the distributable `.vsix`.

**Interfaces:**
- Consumes: the fully wired extension from Task 8.
- Produces: `mockymock-vscode-0.0.1.vsix` in the project root.

- [ ] **Step 1: Launch the Extension Development Host**

In VS Code, open this project folder, then press F5 (uses the
`.vscode/launch.json` written in Task 1, which opens
`mocky-mock/examples/invupdt` as the workspace).

Expected: a new "Extension Development Host" window opens on the
`invupdt` example; the Testing beaker icon appears in the Activity Bar.

- [ ] **Step 2: Verify tree population**

Open the Testing view in the Extension Development Host window.

Expected: the `.cut` file's `TESTSUITE`/`TESTCASE` names appear as a
file → suite → case tree, matching the names in the `.cut` file's text.

- [ ] **Step 3: Verify a full pass**

Click the run icon on the suite (or "Run All").

Expected: the status bar item shows the bootstrap phases in sequence (or
briefly "ready" if `mockymock`/Docker were already set up), then every case
in the tree turns green.

- [ ] **Step 4: Verify a failing EXPECT/VERIFY**

Temporarily edit the `.cut` file's `EXPECT`/`VERIFY` value to something that
will not match (e.g. change an expected total), save, and re-run.

Expected: that case turns red, and clicking it shows the failure message
text (the JUnit `<failure>` reason) inline. Revert the edit afterward.

- [ ] **Step 5: Verify a mid-suite crash**

Temporarily add a case whose `PERFORM` target reaches `STOP RUN`/`GOBACK`
in a way this version's neutralization doesn't cover (or, more simply,
introduce a compile error in a `MOCK` body) and re-run.

Expected: the failing/crashed case shows an error, and any sibling case
that never ran shows the synthetic "did not run — an earlier case in this
suite crashed" message rather than staying stuck in a running state.
Revert the edit afterward.

- [ ] **Step 6: Verify the bootstrap flow with `mockymock` off PATH**

Temporarily rename or move the `mockymock` shim so it's not resolvable,
then run a test.

Expected: the status bar shows an installing phase, and — assuming `uv`
is present — the CLI gets reinstalled automatically and the run proceeds;
check the Task 6 note about the Windows Docker Desktop path if that step's
prompt looks wrong. Restore PATH afterward if the reinstall changed
anything unexpected.

- [ ] **Step 7: Verify the bootstrap flow with Docker Desktop stopped**

Stop Docker Desktop, then run a test.

Expected: the status bar shows "Starting Docker Desktop…", Docker Desktop
launches on its own, and the run proceeds once the daemon is reachable —
no manual `docker` command needed.

- [ ] **Step 8: Package the extension**

Run: `npm run package`
Expected: produces `mockymock-vscode-0.0.1.vsix` in the project root, exits 0.

- [ ] **Step 9: Install and smoke-test the packaged VSIX**

Run: `code --install-extension mockymock-vscode-0.0.1.vsix`
Expected: installs without error. Open a real workspace containing `.cut`
files (not the Extension Development Host) and repeat Step 2 (tree
population) to confirm the packaged build behaves the same as the dev host.

- [ ] **Step 10: Commit the packaging script output note**

No new files to commit from this task (the `.vsix` itself is gitignored via
`*.vsix` in Task 1's `.gitignore`). If any code changes were needed to fix
issues found in Steps 3-7, commit those fixes individually with messages
describing what was fixed.
