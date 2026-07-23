# VS Code Interactive Debugger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user start a real interactive debug session (breakpoints, stepping, variables, COBOL call stack) for a single `.cut` TESTCASE, consuming the `mockymock debug --dap-stdio` DAP server the sibling `mocky-mock` repo now implements (see its `docs/2026-07-22-dap-debugger-design.md`, verified end-to-end against a real container in that repo).

**Architecture:** A `vscode.DebugAdapterDescriptorFactory` registered for a new `mockymock-cobol` debug type spawns `mockymock debug <program> --cut <cut> --case <name> --dap-stdio` as the adapter process — VS Code owns the DAP client side entirely (breakpoints set in the editor gutter, the Variables/Call Stack views, step controls) once that's wired up; this extension does not implement any DAP client logic itself, only the descriptor factory that tells VS Code how to launch the adapter, plus the entry point that starts a session. The entry point is a **second `vscode.TestRunProfileKind.Debug` profile** ("Debug (Interactive)", not default) on the existing `mockymock` TestController, reachable via the dropdown next to the Test Explorer's bug icon (the existing "Debug (Execution Trace)" profile stays the default of that kind, unchanged) — this is the "4th test profile" option the CLI-side design doc left open, chosen over a command-palette action or hand-written `launch.json` because it reuses the same single-test-case selection UX every other profile already has.

**Tech Stack:** TypeScript, VS Code Debug Adapter Protocol / Testing APIs, mocha (`npm run test:unit`).

## Global Constraints

- **`mockymock debug` requires `--dap-stdio` and exactly one `--case`**, refusing before Docker otherwise (mirrors `--trace`'s single-case constraint on the CLI side). The factory must always pass both.
- **Graceful degradation for an older CLI**, matching `supportsTraceFlag`'s existing pattern: `supportsDebugCommand` probes `mockymock --help` for the `debug` subcommand before ever starting a session, never lets an "unrecognized command" argparse failure masquerade as a broken debug adapter.
- **The DAP wire protocol itself is the cross-repo contract here** — not a bespoke JSON contract like `TRACE_JSON_VERSION`. This extension does not parse or validate DAP messages; VS Code's own debug adapter tracker does that. The only thing this repo owns is correctly invoking the CLI process and supplying `program`/`cut`/`case`/`copybookPaths` from the selected test item.
- **This is additive.** "Debug (Execution Trace)" (trace-based, read-only, always available) is unchanged; the new profile is a second, non-default option in the same dropdown, for the slower/heavier interactive case.
- Run unit tests with `npm run test:unit`. Typecheck with `npm run compile`. `testController.ts` (and the new `vscode.DebugAdapterDescriptorFactory`/`DebugConfigurationProvider` classes) depend on the `vscode` module and have no unit-test coverage today — verified only by `npm run compile` plus a manual F5 launch, matching every prior change to `testController.ts`. Pure argument-building logic is split into its own tested module, mirroring `mockymockRunner.ts`'s `buildRunArgs`/`runSuite` split.

---

### Task 1: `supportsDebugCommand` capability check

**Files:**
- Modify: `src/environment/checks.ts`
- Test: `src/environment/checks.test.ts`

**Interfaces:**
- Produces: `supportsDebugCommand(run: CommandRunner, executablePath: string): Promise<boolean>`

- [ ] Add, mirroring `supportsTraceFlag` exactly (probe `[executablePath, '--help']`, check `result.stdout.includes('debug')` in the subcommand list — or `[executablePath, 'debug', '--help']` if a plain top-level `--help` doesn't reliably list subcommand names; check the real CLI's `--help` output shape before picking one).
- [ ] Test mirroring `supportsTraceFlag`'s existing tests (true when present, false on nonzero exit or missing text).
- [ ] `npm run test:unit` passes.
- [ ] Commit: `git commit -m "feat(environment): add supportsDebugCommand capability preflight"`.

---

### Task 2: Pure debug-launch argument builder

**Files:**
- Create: `src/debug/debugAdapterFactory.ts`
- Test: `src/debug/debugAdapterFactory.test.ts`

**Interfaces:**
- Produces:
  - `interface MockymockDebugConfiguration extends vscode.DebugConfiguration { program: string; cut: string; case: string; executablePath?: string; copybookPaths?: string[] }`
  - `buildDebugArgs(config: MockymockDebugConfiguration): string[]` — `['debug', config.program, '--cut', config.cut, '--case', config.case, '--dap-stdio', ...copybookPaths.flatMap(p => ['--copybook-path', p])]`, mirroring `buildRunArgs`'s shape.

- [ ] Write tests asserting the exact argv for a config with and without `copybookPaths`, and that `--dap-stdio` is always present.
- [ ] Implement `buildDebugArgs` as a plain, `vscode`-independent function (it may import `vscode` only for the `DebugConfiguration` type, not at runtime — same import-but-type-only pattern already used elsewhere in this codebase where applicable; if that proves awkward, define a local interface instead of extending `vscode.DebugConfiguration` and adapt at the call site).
- [ ] `npm run test:unit` passes.
- [ ] Commit: `git commit -m "feat(debug): add pure debug-launch argument builder"`.

---

### Task 3: `DebugAdapterDescriptorFactory` and `DebugConfigurationProvider`

**Files:**
- Modify: `src/debug/debugAdapterFactory.ts`
- Create: `src/debug/debugConfigurationProvider.ts`

**Interfaces:**
- Produces:
  - `class MockymockDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory` — `createDebugAdapterDescriptor(session, _executable)` returns `new vscode.DebugAdapterExecutable(executablePath, buildDebugArgs(session.configuration as MockymockDebugConfiguration))`, where `executablePath` comes from `resolveExecutablePath` + the `mockymock.executablePath` setting scoped to the session's workspace folder (same resolution `testController.ts` already does for the trace profile).
  - `class MockymockDebugConfigurationProvider implements vscode.DebugConfigurationProvider` — `resolveDebugConfiguration` validates `program`/`cut`/`case` are present (returns `undefined` with a `vscode.window.showErrorMessage` if not, per the DAP contribution API's convention for refusing to launch) and fills `copybookPaths` from the `mockymock.copybookPaths` setting if the caller didn't supply it explicitly.

- [ ] Implement both classes. No unit tests possible (depends on `vscode`); verify via `npm run compile`.
- [ ] Commit: `git commit -m "feat(debug): add DebugAdapterDescriptorFactory and configuration provider"`.

---

### Task 4: Register the debug type and a "Debug (Interactive)" test profile

**Files:**
- Modify: `src/extension.ts`, `src/testing/testController.ts`, `package.json`

**Interfaces:**
- `package.json` gets a `contributes.debuggers` entry: `{ "type": "mockymock-cobol", "label": "mockymock COBOL", "languages": ["cut"] }` (no `program`/schema needed beyond what `DebugConfigurationProvider` already validates — this is a programmatically-launched debug type, not one users hand-author in `launch.json`).
- `extension.ts` registers both: `vscode.debug.registerDebugAdapterDescriptorFactory('mockymock-cobol', new MockymockDebugAdapterDescriptorFactory())` and `vscode.debug.registerDebugConfigurationProvider('mockymock-cobol', new MockymockDebugConfigurationProvider())`.
- `testController.ts` adds a second `vscode.TestRunProfileKind.Debug` profile, `isDefault: false`: validates exactly one selected case (same message shape as the trace profile's refusal), preflights `supportsDebugCommand`, resolves `cblPath`/`copybookPaths` the same way the trace handler does, then calls `vscode.debug.startDebugging(workspaceFolder, { type: 'mockymock-cobol', request: 'launch', name: <case label>, program: cblPath, cut: cutPath, case: caseItem.label, executablePath, copybookPaths })`.

- [ ] Implement the three changes above.
- [ ] `npm run compile` passes with no new errors.
- [ ] Commit: `git commit -m "feat(testing): add Debug (Interactive) test run profile"`.

---

### Task 5: Manual verification and documentation

**Files:**
- Modify: `README.md`, relevant `.okf/*.md` files (if this repo's OKF bundle documents test profiles/commands — check before assuming).

- [ ] Manual F5 launch against a real fixture `.cbl`/`.cut` pair and a `mockymock` install built from the sibling repo's `claude/debugger-design-lj2gew` branch: select a single TESTCASE, invoke "Debug (Interactive)" from the bug-icon dropdown, set a breakpoint on an original `.cbl` line in the editor gutter, confirm VS Code's own debug UI (Variables, Call Stack, step controls) populates correctly. This is the only real proof the wiring works — `npm run compile` only proves it type-checks.
- [ ] Document the new profile in `README.md` (mirroring how "Debug (Execution Trace)" is already documented) and in the OKF bundle if it covers `testController.ts`/test profiles.
- [ ] Commit: `git commit -m "docs: document Debug (Interactive) profile"`.

---

## Self-Review

**Spec coverage:** Design doc's extension bullets — new `src/debug/` module (Tasks 2-3), additive to the existing trace profile not a replacement (Task 4's `isDefault: false`), version-gate pattern reused (Task 1). Error handling: CLI-too-old degrades via `supportsDebugCommand` before ever starting a session (Task 1, wired in Task 4), 0/2+ case selection refuses with the same message shape the trace profile already uses (Task 4).

**Type consistency:** `MockymockDebugConfiguration` (Task 2) is the single shape threaded through `buildDebugArgs` (Task 2), the descriptor factory (Task 3), and `startDebugging`'s call site (Task 4) — no second config shape invented.

**Known soft spot:** Manual verification (Task 5) requires a `mockymock` install built from the sibling repo's debugger branch, not yet on any released version — flagged explicitly rather than skipped silently.
