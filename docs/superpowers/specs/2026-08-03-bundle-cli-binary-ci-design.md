# Design: CI-bundled mockymock CLI binary

## Problem

Today, the `mockymock` CLI is not shipped with this extension. `EnvironmentManager.installMockymock()` auto-installs it at runtime via:

```
uv tool install git+https://github.com/samdion1994/mocky-mock.git
```

`mocky-mock` is a **private** repo. Anyone without access to it (i.e. any real external user) cannot use this "auto-install" path at all — they'd need `uv`, Python tooling, *and* GitHub access to a repo they don't have. This defeats the "plug and play" goal for a distributable extension.

Separately, `mocky-mock`'s own CI (`build-executables.yml` + `publish-public.yml`, see `mocky-mock/.okf/publishing.md`) already produces self-contained, source-free, Nuitka-compiled `mockymock` binaries for Linux/macOS/Windows and publishes them to a public mirror repo, `samdion1994/cobol-mocky-mock`, as GitHub Release assets. No private-repo access is needed to fetch those.

## Goal

Ship the right platform binary *inside* this extension's `.vsix`, so installing the extension is enough to get a working `mockymock` CLI — no `uv`, no Python, no private-repo access. The existing uv-install path stays as a fallback for cases with no bundled binary (F5 dev-host runs, unsupported platforms).

## Confirmed facts

The `cobol-mocky-mock` v0.1.1 release (queried via `gh api repos/samdion1994/cobol-mocky-mock/releases/tags/v0.1.1`) has exactly these assets:

| Asset | Notes |
|---|---|
| `mockymock-linux-x86_64` | maps to vsce target `linux-x64` |
| `mockymock-macos-arm64` | maps to vsce target `darwin-arm64`. **Apple Silicon only** — no Intel/`darwin-x64` build exists upstream. |
| `mockymock-windows-amd64.exe` | maps to vsce target `win32-x64` |
| `LICENSE` | CLI's license, should ship alongside the bundled binary |

`vsce package --target <t>` accepts `win32-x64`, `linux-x64`, `darwin-arm64` (and others we don't need) and works from any host OS — it's a packaging/manifest operation, not a cross-compile, so a single `ubuntu-latest` CI runner can produce all three `.vsix` files.

This repo currently has **no `.github/workflows/`** and **no `.okf/`** bundle (unlike sibling repos in the workspace).

## Design

### 1. CLI version pin

Add `"mockymockCliVersion": "v0.1.1"` to `package.json`. CI reads this field to know which `cobol-mocky-mock` tag to pull assets from. Bumping the bundled CLI becomes a deliberate, reviewable one-line commit — not an unannounced moving target picked up automatically from "latest".

### 2. CI workflow — `.github/workflows/release.yml`

Trigger: push of a tag matching `v*.*.*`.

Single `ubuntu-latest` job:

1. Checkout, `npm ci`, `npm run compile`, `npm run test:unit` — existing quality gate, now also a release gate.
2. Sanity check: fail the run if the pushed tag, with its leading `v` stripped (e.g. `v0.2.0` → `0.2.0`), doesn't match `package.json`'s `"version"` field verbatim (catches "forgot to bump version" before it ships a mislabeled release).
3. Download release assets from the pinned `cobol-mocky-mock` version into a staging dir:
   ```
   gh release download "$(node -p "require('./package.json').mockymockCliVersion")" \
     -R samdion1994/cobol-mocky-mock -D staging/
   ```
   Public repo — the default `GITHUB_TOKEN` (set as `GH_TOKEN` env for the step) is sufficient; no PAT needed.
4. For each of the 3 `(vsce target, staged asset, bundled filename)` triples:
   - Clear `bin/`.
   - Copy the staged asset into `bin/mockymock` (`chmod +x`) or `bin/mockymock.exe` for the Windows target.
   - Copy `staging/LICENSE` to `bin/LICENSE-mockymock`.
   - `vsce package --target <target> -o dist/`.
5. `gh release create "$TAG" dist/*.vsix --generate-notes` — creates a GitHub Release **on this repo** (`mocky-mock-vscode-extension`), attaching all three platform `.vsix` files.

`bin/` is added to `.gitignore` (never committed — CI populates it transiently per target) but **not** to `.vscodeignore`, so `vsce package` includes whatever is staged there at build time.

### 3. Runtime resolution change

`resolveExecutablePath` in [`src/environment/checks.ts`](../../../src/environment/checks.ts) gains a new middle precedence tier. New signature: `resolveExecutablePath(configuredPath: string | undefined, extensionPath: string): string`.

Precedence:
1. User's `mockymock.executablePath` setting (explicit override — unchanged, always wins).
2. **New:** `<extensionPath>/bin/mockymock` (or `mockymock.exe` on `win32`), if it exists on disk (`fs.existsSync`).
3. Bare `mockymock` resolved from PATH (today's only behavior). This is what F5 Extension Development Host runs hit (no bundled binary there — nothing stages `bin/` outside of the release CI job), and what covers platforms with no bundled build (Intel Mac, Linux ARM).

If neither (2) nor (3) resolves to a working binary, `EnvironmentManager.ensureReady()`'s existing `uv tool install git+https://github.com/samdion1994/mocky-mock.git` bootstrap in `installMockymock()` runs exactly as it does today — **no changes to that method**.

This requires threading `context.extensionPath` into all 6 existing `resolveExecutablePath` call sites:
- `src/environment/environmentManager.ts` (×2)
- `src/debug/debugAdapterFactory.ts`
- `src/linting/lintDiagnostics.ts`
- `src/testing/testController.ts` (×2)

Each of these already runs in a context where `vscode.ExtensionContext` (or something holding `extensionPath`) is reachable at construction time — this is a plumbing change, not a design change, at each site.

### 4. Docs

README gets a new "Install" section: download the `.vsix` matching your OS from this repo's GitHub Releases page, run `code --install-extension <file>.vsix`. Docker Desktop is still required at runtime (unchanged — the bundled binary itself still shells out to Docker for GnuCOBOL compilation).

No new `.okf/` bundle is created for this repo as part of this change — it doesn't have one today, and standing one up (mirroring `mocky-mock/.okf/publishing.md`) is a separate decision from bundling the binary. Just the README update.

## Explicitly out of scope

- **No VS Code Marketplace publish.** Matches the existing `"private": true` / "distribution is a locally built `.vsix` ... not the Marketplace" stance in the current README. Distribution stays "download the right `.vsix` from this repo's GitHub Releases."
- **No `linux-arm64` build.** Upstream `cobol-mocky-mock` doesn't publish one. Falls back to PATH/uv, same as Intel Mac.
- **No change to `installMockymock()`'s uv/private-repo bootstrap.** It remains the last-resort fallback, untouched.

## Testing

- Existing `checks.test.ts` unit tests for `resolveExecutablePath` need updating for the new signature/precedence (bundled-path-exists vs. not, on top of the existing configured-path and default-to-PATH cases). Use a stubbed/temp filesystem path rather than real `fs.existsSync` against `bin/` to keep the test hermetic.
- CI workflow itself is verified by running it end-to-end against a real tag push (no separate unit-testable path for the GitHub Actions YAML).
