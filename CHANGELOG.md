# Changelog

## [0.4.2](https://github.com/samdion1994/mocky-mock-vscode/compare/v0.4.1...v0.4.2) (2026-08-04)


### Bug Fixes

* update publisher name from 'legacylens' to 'lanparty' in package.json ([74b5693](https://github.com/samdion1994/mocky-mock-vscode/commit/74b5693d839745588ef02860b4e440bcccf5db1f))

## [0.4.1](https://github.com/samdion1994/mocky-mock-vscode/compare/v0.4.0...v0.4.1) (2026-08-04)


### Bug Fixes

* verify pinned CLI release has release.yml's required assets ([acd189c](https://github.com/samdion1994/mocky-mock-vscode/commit/acd189c5a80463c2cbbd893e0416786ce2087447))

## [0.4.0](https://github.com/samdion1994/mocky-mock-vscode/compare/v0.3.0...v0.4.0) (2026-08-04)


### Features

* add Export Mainframe-Ready COBOL command ([5093b2c](https://github.com/samdion1994/mocky-mock-vscode/commit/5093b2c77dbb5c636735085a97a8b57bcd661e6a))
* add mockymock.exportMainframe command ([b874c7f](https://github.com/samdion1994/mocky-mock-vscode/commit/b874c7fff6f62e4d3bab632f3906ce3edd685d9e))
* register Export Mainframe-Ready COBOL in the command palette ([4931239](https://github.com/samdion1994/mocky-mock-vscode/commit/49312393f918c8572904a04ae1ae3dd2c9b70211))


### Bug Fixes

* add cacheSeconds parameter to download badge in README ([396fca8](https://github.com/samdion1994/mocky-mock-vscode/commit/396fca89e44e1357662379ff7ea0d09b4ab79b10))
* address final whole-branch review findings for mainframe export command ([e72c827](https://github.com/samdion1994/mocky-mock-vscode/commit/e72c8275b80bfaa703526174a63331c8aafd5fac))

## [0.3.0](https://github.com/samdion1994/mocky-mock-vscode/compare/v0.2.0...v0.3.0) (2026-08-03)


### Features

* add CI-bundled mockymock CLI binary and update documentation ([2c2fd53](https://github.com/samdion1994/mocky-mock-vscode/commit/2c2fd53f8c0583eb054716f8bf045da2d7e5e28b))


### Bug Fixes

* add missing repository field in package.json ([443598a](https://github.com/samdion1994/mocky-mock-vscode/commit/443598a01788906912efae5745a41a23ca7bcbf0))
* correct typo in .gitignore for docs/ entry ([1e656a0](https://github.com/samdion1994/mocky-mock-vscode/commit/1e656a096da3ba6128235d8a02df146539a0e5bf))
* remove duplicate entry for docs/ in .gitignore ([b1cddde](https://github.com/samdion1994/mocky-mock-vscode/commit/b1cddde5167858afb19a68aeb709128ebc70b84d))

## [0.2.0](https://github.com/samdion1994/mocky-mock-vscode/compare/v0.1.0...v0.2.0) (2026-08-03)


### Features

* add environment readiness decision functions ([6b1d01e](https://github.com/samdion1994/mocky-mock-vscode/commit/6b1d01efe9c402ba8ccc2fcf8a1f73efc2fe72a2))
* add EnvironmentManager for mockymock/Docker bootstrap ([e05fa29](https://github.com/samdion1994/mocky-mock-vscode/commit/e05fa29bbb2f903fa69b432bd58a3e9773d36f0e))
* build and execute the mockymock run invocation ([646b017](https://github.com/samdion1994/mocky-mock-vscode/commit/646b01725f155865efda49c5c25f4c96d9a9a5f3))
* bundle mockymock's example COBOL programs into the extension ([f596634](https://github.com/samdion1994/mocky-mock-vscode/commit/f59663452411c45829804a354b274218b12c04d2))
* **cut:** implement provider-based parameterized test cases ([4bbe34b](https://github.com/samdion1994/mocky-mock-vscode/commit/4bbe34ba01ab262a0ab5d43c4f5ba38737e8bb66))
* **debug:** add DebugAdapterDescriptorFactory and configuration provider ([5073c05](https://github.com/samdion1994/mocky-mock-vscode/commit/5073c05158428e9a468fc5a0423059e5b60b8d77))
* **debug:** add mockymock lint preflight to interactive debugging ([1c89629](https://github.com/samdion1994/mocky-mock-vscode/commit/1c89629cc5e61d0c839dfe168b5dce2fcbfee664))
* **debug:** add mockymock lint preflight to the interactive debug session ([33a9731](https://github.com/samdion1994/mocky-mock-vscode/commit/33a9731ea54a194d383c05f2e1e4d9669170c4aa))
* **environment:** add supportsDebugCommand capability preflight ([3a7db49](https://github.com/samdion1994/mocky-mock-vscode/commit/3a7db49edc8264de13955b02f3b85d9b5338bc3a))
* **environment:** add supportsTraceFlag capability preflight ([a901ea0](https://github.com/samdion1994/mocky-mock-vscode/commit/a901ea0090a1aceef133cc61d817cbacf3b7aca3))
* **environment:** resolveExecutablePath checks for a bundled CLI binary ([f560234](https://github.com/samdion1994/mocky-mock-vscode/commit/f56023414efe77db083cbd33809f8132b62c4ac6))
* **environment:** thread extensionPath to every resolveExecutablePath call site ([c1e360a](https://github.com/samdion1994/mocky-mock-vscode/commit/c1e360acbba4541bfe8a6995753e7ee051430dc5))
* map JUnit results onto expected test case names ([34240cf](https://github.com/samdion1994/mocky-mock-vscode/commit/34240cf5fdfd8dc50c59bdff5ed35a33c93f230f))
* parse mockymock's JUnit XML output ([b0229c1](https://github.com/samdion1994/mocky-mock-vscode/commit/b0229c1c8d3a1b96fcca45a6b0ca258d4fee3923))
* parse TESTSUITE/TESTCASE names from .cut files ([4a25eca](https://github.com/samdion1994/mocky-mock-vscode/commit/4a25eca16fbd8c435798ee8ba9b56d79ed33d4cb))
* pytest-grade test experience -- per-case runs, inline diffs, coverage, continuous run, lint, .cut language ([9b495d8](https://github.com/samdion1994/mocky-mock-vscode/commit/9b495d8b91d9b90ca57008237900d94027f6ac25))
* **testing:** add Debug (Execution Trace) test run profile ([a0af846](https://github.com/samdion1994/mocky-mock-vscode/commit/a0af846a1ff38b8c856a99060c23df97fc862f80))
* **testing:** add Debug (Interactive) test run profile ([beb2111](https://github.com/samdion1994/mocky-mock-vscode/commit/beb2111400cf6da42a8b126794f25f8ae37d0f1f))
* **testing:** add trace-JSON parser and console-style renderer ([895f404](https://github.com/samdion1994/mocky-mock-vscode/commit/895f4048f1ce66ce5739b6bc6c7faa147970eaf0))
* **testing:** plumb --trace-json through buildRunArgs and runSuite ([496ed1d](https://github.com/samdion1994/mocky-mock-vscode/commit/496ed1d6c8076fdf810cc0a28410d81d7f561c6e))
* wire the Test Controller into extension activation ([6b5f412](https://github.com/samdion1994/mocky-mock-vscode/commit/6b5f412e7a99cb816ea23ee332e2f2d53e17e2b3))


### Bug Fixes

* address final review findings (staging leakage, vsix filenames, docs, test coverage) ([ce90087](https://github.com/samdion1994/mocky-mock-vscode/commit/ce90087aafefd6574065c76addb810eac90cced8))
* address final whole-branch review findings (Docker detection, arg quoting, install re-verify) ([870c9b0](https://github.com/samdion1994/mocky-mock-vscode/commit/870c9b00aff03b6766ea55ada07ffe8cd446806f))
* address Task 8 test controller review findings ([cdab942](https://github.com/samdion1994/mocky-mock-vscode/commit/cdab942a45e7d3ea037e65e9acbdf30544c3b80b))
* **debug:** cover evaluateLintResult's no-code/no-line branch, note case scope ([f669cc8](https://github.com/samdion1994/mocky-mock-vscode/commit/f669cc89c278306e8ab99e864235b6370f228aae))
* **debug:** enable breakpoints on .cbl COBOL source ([820e7a2](https://github.com/samdion1994/mocky-mock-vscode/commit/820e7a25d292b675af20821a88428a6f72a001c3))
* exclude .superpowers/ scratch directory from packaged .vsix ([b2432fc](https://github.com/samdion1994/mocky-mock-vscode/commit/b2432fc912bfcce45e89d5bd90bbeff2e09f89f5))
* scope CI workflow token permissions ([3d19f85](https://github.com/samdion1994/mocky-mock-vscode/commit/3d19f85766abde27bfcb7eb4ad3cbfb7dabddfbc))
* surface unattributed test failures, wire status bar click to a real action ([0475999](https://github.com/samdion1994/mocky-mock-vscode/commit/0475999807fb966b5862eb10551bcafdbd13ae62))
