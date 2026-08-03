# Publishing without publishing source

## Packaging: what ships in the `.vsix`

Before this change, `.vscodeignore` already excluded `src/**/*.ts`, but the
compiled output it left in (`out/**/*.js`, produced by plain `tsc`) was
still essentially readable source: TypeScript compiles to JS 1:1 with
original comments and identifier names intact. A comment like
`ensureReady() (CLI install, Docker launch) only ever runs as a side
effect of an actual test run, so...` shipped verbatim in the packaged
extension. `node_modules/fast-xml-parser`'s full source also shipped
alongside it, unbundled.

Now `out/extension.js` is produced by `esbuild.js`, which bundles
`src/extension.ts` and everything it imports (including
`fast-xml-parser`) into one file:

- **Production builds** (`npm run vscode:prepublish`, which `vsce
  package`/`npm run package` trigger automatically) minify with no
  sourcemap: comments are stripped and local variable/function-scoped
  names are shortened.
- `.vscodeignore` now excludes everything under `out/` except
  `out/extension.js` itself (`out/**` + `!out/extension.js`), so no stale
  per-module `.js` file from an old `tsc -p ./` run — or a not-fully-clean
  checkout — can slip back in. `node_modules/**` is excluded too, since
  esbuild bundles dependencies in rather than shipping them separately.
- `.github/workflows/ci.yml` packages for real on every push/PR and greps
  the actual file list (`vsce ls`) for exactly this: `out/extension.js`
  must be present, `src/` must be absent, and nothing else may exist under
  `out/`. This is a regression guard, not a formality — it's what caught
  the stale-file leak during development of this change before it ever
  shipped.

**What this does *not* do**: esbuild's default minification does not
rename class/method/property names (only local variables) — safe default,
since this codebase reads/writes plenty of properties whose names have to
stay real (the `vscode` API surface itself, JSON field names in parsed
JUnit/trace reports). So method names like `installMockymockViaGhRelease`
remain fully readable in the shipped bundle even after minification; only
comments, local variable names, and the raw `.ts` files are gone. This is
minification, not obfuscation. Going further (property mangling, control-flow
obfuscation) is possible but risks silently breaking `vscode`-API calls or
report-parsing logic without much more test coverage than exists today —
left as a deliberate non-goal here.

## The CLI auto-bootstrap

`EnvironmentManager.installMockymock()` used to run exactly one thing when
the `mockymock` CLI wasn't found:

```
uv tool install git+https://github.com/samdion1994/mocky-mock.git
```

Both `mocky-mock` and its `cobolparser` dependency are private repos, so
this needs Python, `uv`, *and* git credentials good for both repos — the
exact same repo-read access that lets someone clone and read the full
source of both. For the extension's own promise ("the day-to-day loop
never needs a terminal") this is also just fragile: it's a full `pip`-style
build, at the mercy of Python version and compiler availability on the
user's machine.

It now tries, in order:

1. **`gh release download`** — fetches the prebuilt single-file executable
   (see the mocky-mock repo's own `PUBLISHING.md`) matching the current
   OS/arch (`resolveReleaseAssetName` in `src/environment/checks.ts`) from
   mocky-mock's latest GitHub Release, into the extension's global storage
   directory, then points the `mockymock.executablePath` setting at it.
   No Python, no `uv`, no separate cobolparser auth — the binary already
   has it compiled in.
2. **`uv tool install ...`** (unchanged) — if `gh` isn't installed, there's
   no release asset for this OS/arch yet (`resolveReleaseAssetName` returns
   `null` for anything the release workflow doesn't build, e.g. Intel
   Mac), or the download otherwise fails.

**This still does not remove the need for repo access.** `gh release
download` against a private repo needs `gh auth login` with read access to
`samdion1994/mocky-mock`, same as the `uv`/git path needs git credentials
for it. What changes is *what* that access is good for: today, anyone who
can install mockymock at all can already clone and read both repos in
full. The `gh`-first path only requires read access to mocky-mock's
Releases, is far more likely to just work (no Python toolchain, no
`cobolparser` cross-repo dependency to resolve), and doesn't hand out
anything beyond the one binary it downloads.

Actually reaching users who should have *no* access to either repo needs a
distribution point whose access isn't tied to these repos' permissions —
see the "part this workflow does *not* solve" section in mocky-mock's own
`PUBLISHING.md`. That's a distribution decision, not something this
extension's bootstrap logic can solve by itself.
