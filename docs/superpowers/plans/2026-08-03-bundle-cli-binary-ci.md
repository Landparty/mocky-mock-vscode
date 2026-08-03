# Bundle mockymock CLI Binary via CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `mockymock` CLI binary inside this extension's `.vsix` so installing the extension is enough to get a working CLI — no `uv`, no Python, no private-repo access — while keeping today's PATH/`uv`-install behavior as a fallback.

**Architecture:** A tag-triggered GitHub Actions workflow downloads the three pre-built binaries from the public `samdion1994/cobol-mocky-mock` release (pinned via a `package.json` field), stages one binary at a time into `bin/`, and produces three platform-specific `.vsix` files via `vsce package --target`. At runtime, `resolveExecutablePath` gains a new precedence tier — check `<extensionPath>/bin/mockymock[.exe]` before falling back to PATH — so a packaged extension with a bundled binary needs no install step, while the dev host and unsupported platforms behave exactly as they do today.

**Tech Stack:** TypeScript (Node/CommonJS, `strict` mode), Mocha + `ts-node/register` for unit tests, `@vscode/vsce` for packaging, GitHub Actions (`ubuntu-latest`) + `gh` CLI for the release pipeline.

## Global Constraints

- vsce targets are exactly `win32-x64`, `linux-x64`, `darwin-arm64` — these are the only platforms `cobol-mocky-mock` publishes binaries for (confirmed via `gh api repos/samdion1994/cobol-mocky-mock/releases/tags/v0.1.1`). No `darwin-x64` (Intel Mac) or `linux-arm64` build.
- The CLI version consumed by CI is pinned via `package.json`'s `"mockymockCliVersion"` field — never resolved from "latest" automatically.
- `bin/` must never be committed to git, but must **not** be added to `.vscodeignore` — `vsce package` needs to pick up whatever CI stages there.
- No VS Code Marketplace publish. Distribution stays "download the right `.vsix` from this repo's GitHub Releases."
- `EnvironmentManager.installMockymock()`'s `uv tool install git+https://github.com/samdion1994/mocky-mock.git` bootstrap is not modified by this plan — it remains the last-resort fallback, untouched.
- Every existing test in `src/**/*.test.ts` must keep passing (`npm run test:unit`), and `npm run compile` must produce zero TypeScript errors, after every task.

---

### Task 1: `resolveExecutablePath` gains a bundled-binary precedence tier

**Files:**
- Modify: `src/environment/checks.ts:51-53`
- Test: `src/environment/checks.test.ts:102-112`

**Interfaces:**
- Produces: `resolveExecutablePath(configuredPath: string | undefined, extensionPath: string): string` — **breaking signature change** (was 1 argument, now 2, both required). Precedence: (1) non-blank `configuredPath`, trimmed; (2) `<extensionPath>/bin/mockymock` (`mockymock.exe` on `win32`) if it exists on disk; (3) the literal string `'mockymock'`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('resolveExecutablePath', ...)` block (lines 102-112) in `src/environment/checks.test.ts` with:

```ts
describe('resolveExecutablePath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-checks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns "mockymock" when unconfigured and no bundled binary exists', () => {
    assert.strictEqual(resolveExecutablePath(undefined, tempDir), 'mockymock');
    assert.strictEqual(resolveExecutablePath('', tempDir), 'mockymock');
    assert.strictEqual(resolveExecutablePath('   ', tempDir), 'mockymock');
  });

  it('returns the configured path when set, even if a bundled binary exists', () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'mockymock.exe' : 'mockymock'), '');
    assert.strictEqual(resolveExecutablePath('/opt/mockymock/bin/mockymock', tempDir), '/opt/mockymock/bin/mockymock');
  });

  it('returns the bundled binary path when present and nothing is configured', () => {
    const binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    const bundledName = process.platform === 'win32' ? 'mockymock.exe' : 'mockymock';
    fs.writeFileSync(path.join(binDir, bundledName), '');
    assert.strictEqual(resolveExecutablePath(undefined, tempDir), path.join(binDir, bundledName));
  });

  it('falls back to "mockymock" when the extension has no bin directory at all', () => {
    assert.strictEqual(resolveExecutablePath(undefined, path.join(tempDir, 'does-not-exist')), 'mockymock');
  });
});
```

Add these imports at the top of `src/environment/checks.test.ts` (alongside the existing `import * as assert from 'assert';`):

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL to compile — `resolveExecutablePath(undefined, tempDir)` etc. now pass 2 arguments but the current implementation only accepts 1 (`ts-node` type-checks under `strict`, so this is a compile-time error, e.g. "Expected 1 arguments, but got 2").

- [ ] **Step 3: Implement the signature change**

In `src/environment/checks.ts`, add these two imports at the top (alongside the existing `import { CommandRunner } from './commandRunner';`):

```ts
import * as fs from 'fs';
import * as path from 'path';
```

Replace the existing `resolveExecutablePath` function (lines 51-53):

```ts
export function resolveExecutablePath(configuredPath: string | undefined): string {
  return configuredPath && configuredPath.trim().length > 0 ? configuredPath.trim() : 'mockymock';
}
```

with:

```ts
export function resolveExecutablePath(configuredPath: string | undefined, extensionPath: string): string {
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }
  const bundledName = process.platform === 'win32' ? 'mockymock.exe' : 'mockymock';
  const bundledPath = path.join(extensionPath, 'bin', bundledName);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  return 'mockymock';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — all `resolveExecutablePath` tests green, and every other existing test still passes (nothing else in `checks.ts` changed behaviorally).

- [ ] **Step 5: Commit**

```bash
git add src/environment/checks.ts src/environment/checks.test.ts
git commit -m "feat(environment): resolveExecutablePath checks for a bundled CLI binary"
```

---

### Task 2: Thread `extensionPath` through every call site

**Files:**
- Modify: `src/environment/environmentManager.ts:16-24,44-46,63-65`
- Modify: `src/debug/debugAdapterFactory.ts:9-20`
- Modify: `src/extension.ts:17-20`
- Modify: `src/linting/lintDiagnostics.ts:49`
- Modify: `src/testing/testController.ts:71-75,299`

**Interfaces:**
- Consumes: `resolveExecutablePath(configuredPath: string | undefined, extensionPath: string): string` from Task 1.
- Produces: no new exports — this task only updates callers so the codebase compiles again under the new required-second-argument signature.

- [ ] **Step 1: Update `EnvironmentManager` to store and pass `extensionPath`**

In `src/environment/environmentManager.ts`, add a field and set it in the constructor:

```ts
export class EnvironmentManager {
  private statusBarItem: vscode.StatusBarItem;
  private readonly extensionPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
```

(keep the rest of the constructor body unchanged after that).

Then update both existing `resolveExecutablePath` calls to pass `this.extensionPath` as the second argument. In `refreshStatus()`:

```ts
    const executablePath = resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock').get<string>('executablePath'),
      this.extensionPath
    );
```

And identically in `ensureReady()` (same call shape, second occurrence in the file).

- [ ] **Step 2: Update `MockymockDebugAdapterDescriptorFactory` to accept `extensionPath`**

In `src/debug/debugAdapterFactory.ts`, add a constructor and use the stored value:

```ts
export class MockymockDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(private readonly extensionPath: string) {}

  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const config = session.configuration as unknown as MockymockDebugConfiguration;
    const workspaceUri = session.workspaceFolder?.uri;
    const configuredPath = workspaceUri
      ? vscode.workspace.getConfiguration('mockymock', workspaceUri).get<string>('executablePath')
      : vscode.workspace.getConfiguration('mockymock').get<string>('executablePath');
    const executablePath = resolveExecutablePath(config.executablePath ?? configuredPath, this.extensionPath);
    return new vscode.DebugAdapterExecutable(executablePath, buildDebugArgs(config));
  }
}
```

- [ ] **Step 3: Pass `context.extensionPath` at the registration site**

In `src/extension.ts`, change:

```ts
      new MockymockDebugAdapterDescriptorFactory()
```

to:

```ts
      new MockymockDebugAdapterDescriptorFactory(context.extensionPath)
```

- [ ] **Step 4: Update `lintDiagnostics.ts`**

In `src/linting/lintDiagnostics.ts`, change (inside `activateLintDiagnostics(context)`, which already has `context` in scope):

```ts
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'));
```

to:

```ts
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
```

- [ ] **Step 5: Update `testController.ts`**

In `src/testing/testController.ts`, `resolveConfiguredExecutable` (inside `activateTestController(context, environmentManager)`, which already has `context` in scope) changes from:

```ts
  function resolveConfiguredExecutable(uri: vscode.Uri): string {
    return resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock', uri).get<string>('executablePath')
    );
  }
```

to:

```ts
  function resolveConfiguredExecutable(uri: vscode.Uri): string {
    return resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock', uri).get<string>('executablePath'),
      context.extensionPath
    );
  }
```

And inside `runOneFile` (also nested inside `activateTestController`, so `context` is in scope there too), change:

```ts
    const executablePath = resolveExecutablePath(config.get<string>('executablePath'));
```

to:

```ts
    const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
```

- [ ] **Step 6: Compile and run the full test suite**

Run: `npm run compile`
Expected: 0 TypeScript errors — this is what confirms every call site across the codebase was actually updated (a missed site fails here, since `test:unit` alone doesn't import these files).

Run: `npm run test:unit`
Expected: PASS — full existing suite green, no behavioral change for any currently-passing scenario (bundled path never exists in these unit tests' `extensionPath`, so every call falls through to the pre-existing PATH-or-configured behavior).

- [ ] **Step 7: Commit**

```bash
git add src/environment/environmentManager.ts src/debug/debugAdapterFactory.ts src/extension.ts src/linting/lintDiagnostics.ts src/testing/testController.ts
git commit -m "feat(environment): thread extensionPath to every resolveExecutablePath call site"
```

---

### Task 3: CI release workflow — pin, gitignore, and the workflow file

**Files:**
- Modify: `package.json:5` (add `mockymockCliVersion`)
- Modify: `.gitignore` (add `bin/`)
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (this task's binary-staging is what Task 1/2's runtime code reads from, but the two are independently deployable — the runtime code degrades safely to today's behavior if `bin/` is absent).
- Produces: a tag-triggered GitHub Actions workflow; no code-level interface.

- [ ] **Step 1: Pin the CLI version in `package.json`**

In `package.json`, add a new field right after `"version": "0.1.0",` (line 5):

```json
  "version": "0.1.0",
  "mockymockCliVersion": "v0.1.1",
```

- [ ] **Step 2: Ignore the staging directory**

Append to `.gitignore`:

```
bin/
```

(full file becomes: `node_modules/`, `out/`, `*.vsix`, `.superpowers/`, `docs/`, `.vscode/`, `bin/`)

- [ ] **Step 3: Write the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Compile
        run: npm run compile

      - name: Unit tests
        run: npm run test:unit

      - name: Verify tag matches package.json version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG_VERSION="$(node -p "require('./package.json').version")"
          if [ "$TAG" != "$PKG_VERSION" ]; then
            echo "Tag $GITHUB_REF_NAME does not match package.json version $PKG_VERSION" >&2
            exit 1
          fi

      - name: Prepare staging and output directories
        run: mkdir -p staging dist

      - name: Download mockymock CLI release assets
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          CLI_VERSION="$(node -p "require('./package.json').mockymockCliVersion")"
          gh release download "$CLI_VERSION" -R samdion1994/cobol-mocky-mock -D staging --clobber

      - name: Package win32-x64
        run: |
          rm -rf bin && mkdir bin
          cp staging/mockymock-windows-amd64.exe bin/mockymock.exe
          cp staging/LICENSE bin/LICENSE-mockymock
          npx vsce package --target win32-x64 -o dist/

      - name: Package linux-x64
        run: |
          rm -rf bin && mkdir bin
          cp staging/mockymock-linux-x86_64 bin/mockymock
          chmod +x bin/mockymock
          cp staging/LICENSE bin/LICENSE-mockymock
          npx vsce package --target linux-x64 -o dist/

      - name: Package darwin-arm64
        run: |
          rm -rf bin && mkdir bin
          cp staging/mockymock-macos-arm64 bin/mockymock
          chmod +x bin/mockymock
          cp staging/LICENSE bin/LICENSE-mockymock
          npx vsce package --target darwin-arm64 -o dist/

      - name: Create GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${GITHUB_REF_NAME}" dist/*.vsix --generate-notes
```

- [ ] **Step 4: Validate the workflow YAML parses**

Run: `npx --yes js-yaml .github/workflows/release.yml`
Expected: prints the parsed document back out (as YAML/JSON) with no error — confirms there's no syntax mistake (bad indentation, unescaped `#`, etc.) before this ever reaches a real Actions run.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow bundling the mockymock CLI binary"
```

- [ ] **Step 6 (manual, not automated — do this yourself when ready to cut a release):**

Push a tag matching `package.json`'s `"version"` (e.g. `git tag v0.1.0 && git push origin v0.1.0` once `"version"` is bumped past `0.1.0` for a real release) and watch the Actions run. This is a real, visible, hard-to-reverse action (creates a public GitHub Release with binary assets) — do it deliberately, not as part of running this plan.

---

### Task 4: README install instructions

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add an "Install" section**

In `README.md`, insert a new `## Install` section immediately after the `## Features` list and before `## Settings` (i.e. right before the `## Settings` heading):

````markdown
## Install

Download the `.vsix` matching your OS from this repo's
[Releases page](https://github.com/samdion1994/mocky-mock-vscode/releases),
then install it:

```bash
code --install-extension mockymock-vscode-<version>-<platform>.vsix
```

| OS | File to download |
|---|---|
| Windows (x64) | `mockymock-vscode-<version>-win32-x64.vsix` |
| Linux (x64) | `mockymock-vscode-<version>-linux-x64.vsix` |
| macOS (Apple Silicon) | `mockymock-vscode-<version>-darwin-arm64.vsix` |

Each package bundles a matching `mockymock` CLI binary — no separate CLI
install step needed. Docker Desktop is still required at runtime (see
Requirements below). Intel Macs and any other platform without a bundled
binary fall back to installing the CLI via `uv` on first run, same as
before.
````

- [ ] **Step 2: Clarify the Requirements section's first bullet**

Change the first bullet under `## Requirements` from:

```markdown
- The `mockymock` CLI (auto-installed via `uv` on first run if missing).
```

to:

```markdown
- The `mockymock` CLI. Official release `.vsix` packages (see Install
  above) already bundle a matching binary — nothing to install. Otherwise
  (running from source, or on a platform with no bundled binary) it's
  auto-installed via `uv` on first run if missing.
```

- [ ] **Step 3: Clarify the Development section's distribution note**

Change:

```markdown
Press F5 to launch the Extension Development Host against
`../mocky-mock/examples/invupdt`. Distribution is a locally built `.vsix`
(`code --install-extension mockymock-vscode-<version>.vsix`) — not the
Marketplace.
```

to:

```markdown
Press F5 to launch the Extension Development Host against
`../mocky-mock/examples/invupdt`. A `.vsix` built locally via `npm run
package` does **not** bundle a CLI binary (nothing populates `bin/`
outside of the release CI workflow) — it falls back to the CLI on PATH /
`uv`-install, same as the dev host. Official, CLI-bundled releases are
built by `.github/workflows/release.yml` and published to this repo's
GitHub Releases (see Install above) — not the Marketplace.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document installing the CLI-bundled .vsix releases"
```
