# Changelog

## [0.13.1](https://github.com/Landparty/mocky-mock-vscode/compare/v0.13.0...v0.13.1) (2026-10-17)


### Bug Fixes

* "Starting Docker Desktop…" on Windows moves on to the readiness poll ([f1d66be](https://github.com/Landparty/mocky-mock-vscode/commit/f1d66be656c47d9988f399ac1b006556522d1026)), closes [#98](https://github.com/Landparty/mocky-mock-vscode/issues/98)
* `~`, `${workspaceFolder}` and relative paths work in the CLI and copybook settings ([404cd07](https://github.com/Landparty/mocky-mock-vscode/commit/404cd0742f050869934b7d2bf655bbe8fa652b2e)), closes [#132](https://github.com/Landparty/mocky-mock-vscode/issues/132) [#151](https://github.com/Landparty/mocky-mock-vscode/issues/151)
* 63 open extension bugs (test results, Docker setup, pairing, lint, completion, New Test Suite) ([614adeb](https://github.com/Landparty/mocky-mock-vscode/commit/614adebf7aa81b5cb6d6cb462f9b4832735df054))
* a broken mockymock.executablePath is reported instead of auto-installing ([aec1691](https://github.com/Landparty/mocky-mock-vscode/commit/aec1691af8716f6cc669ab80b902329d22a43510)), closes [#93](https://github.com/Landparty/mocky-mock-vscode/issues/93)
* a hung `docker info` no longer hangs test runs and Check Setup forever ([2ff591c](https://github.com/Landparty/mocky-mock-vscode/commit/2ff591cbfd3f23634442aeaa79889901068119b9)), closes [#146](https://github.com/Landparty/mocky-mock-vscode/issues/146)
* a multi-suite test run makes one setup attempt instead of one per file ([f969a8d](https://github.com/Landparty/mocky-mock-vscode/commit/f969a8d3affde1a10b9d93714950ef50ed40a1e2)), closes [#129](https://github.com/Landparty/mocky-mock-vscode/issues/129)
* a suite pairs with an uppercase PROG.CBL/.COB/.COBOL before the CLI's pairing arrives ([cfa445a](https://github.com/Landparty/mocky-mock-vscode/commit/cfa445a71e55466a479be84c9b6b5bb4ff251432)), closes [#119](https://github.com/Landparty/mocky-mock-vscode/issues/119)
* a suite the CLI cannot pair shows the CLI's reason in lint, Run, Debug, Mutation and Open the Program ([68ddff9](https://github.com/Landparty/mocky-mock-vscode/commit/68ddff992444db6a302e94dad82a04f0ecaa729b)), closes [#106](https://github.com/Landparty/mocky-mock-vscode/issues/106)
* a Windows path with a space and a trailing backslash reaches the CLI intact ([e03f54a](https://github.com/Landparty/mocky-mock-vscode/commit/e03f54a9f98c48a17769e6bd8daa6b3de0903a44)), closes [#111](https://github.com/Landparty/mocky-mock-vscode/issues/111)
* accepting a MOCK key inside auto-closed quotes no longer leaves a stray quote ([2e58af6](https://github.com/Landparty/mocky-mock-vscode/commit/2e58af69790e56d6d798bea38d182ab305cb5b10)), closes [#133](https://github.com/Landparty/mocky-mock-vscode/issues/133)
* an auto-installed CLI is used even when uv's tool directory isn't on PATH ([67c5d41](https://github.com/Landparty/mocky-mock-vscode/commit/67c5d412af43b92b6e67ab70ba4342d3e0f717fe)), closes [#114](https://github.com/Landparty/mocky-mock-vscode/issues/114)
* cancelling a run on Windows stops mockymock and its Docker work ([2d8daf8](https://github.com/Landparty/mocky-mock-vscode/commit/2d8daf84f3931afe5db35bded90a290200a265e0)), closes [#88](https://github.com/Landparty/mocky-mock-vscode/issues/88)
* Check Setup shows why Docker could not be started, with Try Again ([62029ad](https://github.com/Landparty/mocky-mock-vscode/commit/62029adbf4ea9981b24ce564500d01802e936a86)), closes [#126](https://github.com/Landparty/mocky-mock-vscode/issues/126)
* closing a .cut while its lint runs no longer leaves its problems in the Problems panel ([d9421bc](https://github.com/Landparty/mocky-mock-vscode/commit/d9421bccf3e54c4f6af9ab8d7b9f357fe687fee6)), closes [#110](https://github.com/Landparty/mocky-mock-vscode/issues/110)
* continuous run reruns suites under tests/ and PROG.&lt;topic&gt;.cut on a program save ([19152f1](https://github.com/Landparty/mocky-mock-vscode/commit/19152f1febc2a65bb287dc6b9e76a06754f179e7)), closes [#86](https://github.com/Landparty/mocky-mock-vscode/issues/86)
* continuous run waits for rediscovery before rerunning a saved .cut ([da71c97](https://github.com/Landparty/mocky-mock-vscode/commit/da71c97143d2fdf1aa1d8a713765da44e7090423)), closes [#121](https://github.com/Landparty/mocky-mock-vscode/issues/121)
* copybook libraries in a zapp.yml property group with no language reach lint and run ([c12c8d7](https://github.com/Landparty/mocky-mock-vscode/commit/c12c8d7b54a4aff46cb9792c4d9e64c0bd633a1a)), closes [#136](https://github.com/Landparty/mocky-mock-vscode/issues/136)
* copybook settings, zapp.yml and copybook saves re-lint open suites and refresh completion ([5076297](https://github.com/Landparty/mocky-mock-vscode/commit/50762973772cc7948c3ed9434abda871432451ea)), closes [#113](https://github.com/Landparty/mocky-mock-vscode/issues/113)
* deleting or renaming a folder of .cut suites updates Test Explorer ([08b1f91](https://github.com/Landparty/mocky-mock-vscode/commit/08b1f91b07ef2f51fa0b77ed779564b738ae3fa8)), closes [#91](https://github.com/Landparty/mocky-mock-vscode/issues/91)
* error the suite when mockymock run exits nonzero although every case passed ([1a2c133](https://github.com/Landparty/mocky-mock-vscode/commit/1a2c133a1080ae727a5ce9886254deca2cf3ce29)), closes [#83](https://github.com/Landparty/mocky-mock-vscode/issues/83)
* explain why a launch.json debug session cannot start ([1c6817e](https://github.com/Landparty/mocky-mock-vscode/commit/1c6817eb7f85553c4c81a7d03180feca7f8d4fe6)), closes [#97](https://github.com/Landparty/mocky-mock-vscode/issues/97)
* Export Mainframe-Ready COBOL and Run Mutation Test save unsaved edits first ([075b81f](https://github.com/Landparty/mocky-mock-vscode/commit/075b81fa808734d48f748f031441a2a936d99a5c)), closes [#99](https://github.com/Landparty/mocky-mock-vscode/issues/99)
* Fill In Missing Mocks warns about leftovers and re-lints after a partial fill ([3faa9e8](https://github.com/Landparty/mocky-mock-vscode/commit/3faa9e8adc1d5782efd56ccd4db973831d950d80)), closes [#96](https://github.com/Landparty/mocky-mock-vscode/issues/96)
* give an expanded ~ path one separator style on Windows ([86f110b](https://github.com/Landparty/mocky-mock-vscode/commit/86f110b4cb83263c256afa83a68d6c11ba4b877f))
* give same-named TESTCASEs their own verdicts instead of the last one's ([f7dbdf0](https://github.com/Landparty/mocky-mock-vscode/commit/f7dbdf04b7a8a60be799c08bd0e1a5d9edf9de88)), closes [#84](https://github.com/Landparty/mocky-mock-vscode/issues/84)
* highlight CAPTURE ARG ... INTO and MOVE/EXPECT on subscripted or qualified names ([ea988ce](https://github.com/Landparty/mocky-mock-vscode/commit/ea988ce01d7447cc8cf89c1fbab92c6b6c9440e0)), closes [#102](https://github.com/Landparty/mocky-mock-vscode/issues/102)
* highlight only whole-line *&gt; comments and single-quoted literals as the CLI reads them ([939cffd](https://github.com/Landparty/mocky-mock-vscode/commit/939cffd5c581f37fee3a88d8f73893ada726bba4)), closes [#139](https://github.com/Landparty/mocky-mock-vscode/issues/139)
* highlight tagged TESTCASE names, VERIFY keys and lowercase FILE-STATUS mnemonics; fold on lowercase END-MOCK ([fc1d290](https://github.com/Landparty/mocky-mock-vscode/commit/fc1d2906109b5dced8251d942af11392fc91fcd5)), closes [#117](https://github.com/Landparty/mocky-mock-vscode/issues/117)
* install mockymock 0.10.2, which accepts FILE-STATUS on WRITE and REWRITE ([ed8e8f4](https://github.com/Landparty/mocky-mock-vscode/commit/ed8e8f4866116285f4ce73ab71704c327dcaa01e)), closes [#101](https://github.com/Landparty/mocky-mock-vscode/issues/101)
* keep .cbl lines and MOCK snippet nesting straight in lint messages ([4176388](https://github.com/Landparty/mocky-mock-vscode/commit/4176388d565123b0a6886f9469050ab13b813b60)), closes [#140](https://github.com/Landparty/mocky-mock-vscode/issues/140)
* keep dev scripts and release-please config out of the .vsix ([1cb73c5](https://github.com/Landparty/mocky-mock-vscode/commit/1cb73c5b91e703abe03498c12296429c0cd709dc)), closes [#128](https://github.com/Landparty/mocky-mock-vscode/issues/128)
* keep MOCK completions open on a partial category and inside a quoted key with spaces ([80da706](https://github.com/Landparty/mocky-mock-vscode/commit/80da706fea321cda2dd70dbb5732b2c899130079)), closes [#137](https://github.com/Landparty/mocky-mock-vscode/issues/137)
* lint puts a refusal that names a .cut line (UNKNOWN_DATA_NAME) under that line ([0a483c6](https://github.com/Landparty/mocky-mock-vscode/commit/0a483c6921db1ec2c4bcd53be6eca524a34a889b)), closes [#104](https://github.com/Landparty/mocky-mock-vscode/issues/104)
* make the merged fixes agree with each other ([635b341](https://github.com/Landparty/mocky-mock-vscode/commit/635b341fe964922b3b12a63dca1d7903ab1e02cd))
* New Test Suite and Open Test Suite refuse an exported PROG.mainframe.cbl and point at PROG.cbl ([d7fc74d](https://github.com/Landparty/mocky-mock-vscode/commit/d7fc74d8719a74695543b5fb5dced1b4f29b37db)), closes [#125](https://github.com/Landparty/mocky-mock-vscode/issues/125) [#149](https://github.com/Landparty/mocky-mock-vscode/issues/149)
* New Test Suite's toasts describe what was actually written and why a step failed ([6f40b5f](https://github.com/Landparty/mocky-mock-vscode/commit/6f40b5f9daf10110f0fe7e8edce78ba83355c6cb)), closes [#109](https://github.com/Landparty/mocky-mock-vscode/issues/109) [#131](https://github.com/Landparty/mocky-mock-vscode/issues/131) [#135](https://github.com/Landparty/mocky-mock-vscode/issues/135) [#142](https://github.com/Landparty/mocky-mock-vscode/issues/142) [#150](https://github.com/Landparty/mocky-mock-vscode/issues/150)
* offer Export Mainframe-Ready COBOL in the editor and Explorer context menus ([7764416](https://github.com/Landparty/mocky-mock-vscode/commit/7764416127805d82f260ff3127f951afe518a9f0)), closes [#148](https://github.com/Landparty/mocky-mock-vscode/issues/148)
* offer MOCK completions only after uppercase MOCK and category, as the CLI requires ([e0d415b](https://github.com/Landparty/mocky-mock-vscode/commit/e0d415b143afeb32d06b0e027aa34be31f7ed716)), closes [#144](https://github.com/Landparty/mocky-mock-vscode/issues/144)
* offer only quoted keys after MOCK MQ, not bare dynamic-CALL identifiers ([a630fd5](https://github.com/Landparty/mocky-mock-vscode/commit/a630fd5217594ea681c4b14e4bfbb982cbe7fce3)), closes [#124](https://github.com/Landparty/mocky-mock-vscode/issues/124)
* offer ROWS after MOCK CICS "...", which the CLI sequences like CALL/DLI ([8d0f249](https://github.com/Landparty/mocky-mock-vscode/commit/8d0f249f4b7c90eaebe8568b144fa258f9733cdc)), closes [#94](https://github.com/Landparty/mocky-mock-vscode/issues/94)
* offer the program's paragraph and section names after MOCK PARAGRAPH / MOCK SECTION ([4e9d1c5](https://github.com/Landparty/mocky-mock-vscode/commit/4e9d1c5cce984e4312ef9dad7503579f1d04a756)), closes [#134](https://github.com/Landparty/mocky-mock-vscode/issues/134)
* Open Test Suite's "New Test Suite…" goes straight to the topic prompt ([c8e932c](https://github.com/Landparty/mocky-mock-vscode/commit/c8e932cc2d776a40e8a0d7a303fb6cc89f19554b)), closes [#127](https://github.com/Landparty/mocky-mock-vscode/issues/127)
* run and debug a single TESTCASE whose name starts with "-" ([b00c806](https://github.com/Landparty/mocky-mock-vscode/commit/b00c8067273c0d1cd8c4847dc7bfa2d00df53a0f)), closes [#118](https://github.com/Landparty/mocky-mock-vscode/issues/118)
* Run with Coverage shows the union of every suite of a program ([16388bf](https://github.com/Landparty/mocky-mock-vscode/commit/16388bf782e3680c3b46c6f9f822d7b10c487479)), closes [#87](https://github.com/Landparty/mocky-mock-vscode/issues/87)
* saving, creating or deleting a COBOL program re-lints its open .cut suites ([4109382](https://github.com/Landparty/mocky-mock-vscode/commit/41093824eba08aa8e2c2ff39e42af31bf50c8367)), closes [#107](https://github.com/Landparty/mocky-mock-vscode/issues/107)
* say "Docker access denied" instead of starting a running daemon and waiting 90s ([7d442ce](https://github.com/Landparty/mocky-mock-vscode/commit/7d442ce3de2953643cbf1b1219883818008afe33)), closes [#112](https://github.com/Landparty/mocky-mock-vscode/issues/112)
* shared-mock snippet no longer writes an unquoted (dynamic) MOCK CALL ([cc99882](https://github.com/Landparty/mocky-mock-vscode/commit/cc99882ab102dcfe6acbb30c741d6fbbff7cd185)), closes [#147](https://github.com/Landparty/mocky-mock-vscode/issues/147)
* show the refusal or compile error on each case instead of "did not run" ([c7b1b51](https://github.com/Landparty/mocky-mock-vscode/commit/c7b1b5112202a681dc8e230b3a780954c3501f52)), closes [#85](https://github.com/Landparty/mocky-mock-vscode/issues/85)
* Stop in Test Results now kills a continuous-mode rerun ([d484889](https://github.com/Landparty/mocky-mock-vscode/commit/d484889bbc4be3e1f363e887303590c26756835f)), closes [#122](https://github.com/Landparty/mocky-mock-vscode/issues/122)
* suites in a nested project are paired and created against that project's own config ([77c6b90](https://github.com/Landparty/mocky-mock-vscode/commit/77c6b90188e024edae4f06e59e08c3713e073764)), closes [#105](https://github.com/Landparty/mocky-mock-vscode/issues/105)
* suites in a workspace under a worktrees/node_modules folder are discovered, and build/dist/venv copies are not ([e30fe2f](https://github.com/Landparty/mocky-mock-vscode/commit/e30fe2f5c15a292d605a2e7d4e2b77ce5f8e43a7)), closes [#116](https://github.com/Landparty/mocky-mock-vscode/issues/116) [#138](https://github.com/Landparty/mocky-mock-vscode/issues/138)
* suites under tests/ keep their program when the workspace is opened through a symlink or mapped drive ([b4551dc](https://github.com/Landparty/mocky-mock-vscode/commit/b4551dcbb49dfa31a82ef3829cd4eaecfc7daf58)), closes [#90](https://github.com/Landparty/mocky-mock-vscode/issues/90)
* suites under tests/ show their lint problems after a window reload without a save ([a610d66](https://github.com/Landparty/mocky-mock-vscode/commit/a610d66022f7a6e478cf0c51fb767b102d64c7ad)), closes [#89](https://github.com/Landparty/mocky-mock-vscode/issues/89)
* Test Explorer keeps the newest case list when discoveries of a file overlap ([156ee59](https://github.com/Landparty/mocky-mock-vscode/commit/156ee59dbe26d18ea4ff563f6b0d1fbabd78bddd)), closes [#123](https://github.com/Landparty/mocky-mock-vscode/issues/123)
* the no-CLI starter suite PERFORMs the first section of a sections-only program ([e446fb2](https://github.com/Landparty/mocky-mock-vscode/commit/e446fb2a7bcad7d22e965e74bf24634f0df62251)), closes [#120](https://github.com/Landparty/mocky-mock-vscode/issues/120)
* the status bar re-checks the CLI when mockymock.executablePath changes ([7c70143](https://github.com/Landparty/mocky-mock-vscode/commit/7c7014311f40bfb644f57d810bc8b5d72671b44f)), closes [#115](https://github.com/Landparty/mocky-mock-vscode/issues/115)
* word never-executed mutation survivors as missing coverage ([20c98ca](https://github.com/Landparty/mocky-mock-vscode/commit/20c98caee547e4e64d6ec18fc1509232f0f2766b)), closes [#92](https://github.com/Landparty/mocky-mock-vscode/issues/92)

## [0.13.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.12.0...v0.13.0) (2026-10-14)


### Features

* hide Execution Trace and add a Run Mutation Test menu entry ([2f8429c](https://github.com/Landparty/mocky-mock-vscode/commit/2f8429c875f958bbf9f6740343df575b532f5179))
* hide Execution Trace and add a Run Mutation Test menu entry ([5171a29](https://github.com/Landparty/mocky-mock-vscode/commit/5171a295066d128f681a6cd72d52b8fb9a3d0044))
* several test suites per program, kept under tests/ ([a133d26](https://github.com/Landparty/mocky-mock-vscode/commit/a133d26113c49f1cd48b60184ba3add8be6955aa))
* several test suites per program, kept under tests/ ([7028825](https://github.com/Landparty/mocky-mock-vscode/commit/7028825c9390d251085340875ed817dbd5110daa))


### Bug Fixes

* keep a PROGRAM path relative to the suite's folder on Windows ([b9bf60e](https://github.com/Landparty/mocky-mock-vscode/commit/b9bf60e1c04024d061861cc7b2790fb71d22c56c))

## [0.12.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.11.0...v0.12.0) (2026-10-14)


### Features

* add editor right-click menu for cobol-parser analyzers and Program Flow ([9a96080](https://github.com/Landparty/mocky-mock-vscode/commit/9a96080c027e8fc5ce69cc65656f4c63a4690ae2))
* **cut:** highlight, fold and snippet the suite hook blocks ([72f4ec2](https://github.com/Landparty/mocky-mock-vscode/commit/72f4ec24694316d134c099b5888c7218221b0b55))
* **cut:** highlight, fold and snippet the suite hook blocks ([dbeb33b](https://github.com/Landparty/mocky-mock-vscode/commit/dbeb33bba940320fc9767fad45abab0b9a58bf82))
* **cut:** support AFTER-EACH/AFTER-ALL hooks and per-call ROWS ([3f047cb](https://github.com/Landparty/mocky-mock-vscode/commit/3f047cb7aed77dfc125130428ec91980dbc92f44))
* **debug:** give hand-authored launch configs a schema and copybook defaults ([d48b0a6](https://github.com/Landparty/mocky-mock-vscode/commit/d48b0a65ff07857bfc242f6a62c9d41904dce489))
* implement COBOL definition and reference providers for improved navigation ([fd2917a](https://github.com/Landparty/mocky-mock-vscode/commit/fd2917a065091b0c43a2a83455eecf8ab1f520e4))
* make the extension easier to find your way around ([2657b4f](https://github.com/Landparty/mocky-mock-vscode/commit/2657b4f228f9e6f714b2333a927381b9fe7e9047))
* make the extension easier to find your way around ([54d8b1a](https://github.com/Landparty/mocky-mock-vscode/commit/54d8b1a49a3c8fe9051d06b2939f6c889d216391))
* move COBOL language support and analysis to the cobol-analyzer extension ([e32defb](https://github.com/Landparty/mocky-mock-vscode/commit/e32defb3e80d968828aa78cbaef37f494c9debdc))
* **mutation:** show the CLI's hint on survivors the test data cannot kill ([7ccd09f](https://github.com/Landparty/mocky-mock-vscode/commit/7ccd09faa9ca03e37fae41def3c8d513dbef7566))
* resolve copybook paths from a zapp.yml at the workspace root ([4705e58](https://github.com/Landparty/mocky-mock-vscode/commit/4705e584fd7b839bb84ac193d56a2b526bed1388))
* resolve copybook paths from a zapp.yml at the workspace root ([3769bdf](https://github.com/Landparty/mocky-mock-vscode/commit/3769bdfc7ef2a1b55e44ac35feddcf8921da6a1e))
* **setup:** report cobol-parser and project-config health in Check Setup ([9751058](https://github.com/Landparty/mocky-mock-vscode/commit/9751058398c29a031f9811740deb8899e8017511))
* simpler, friendlier first-run experience ([e7d5ddf](https://github.com/Landparty/mocky-mock-vscode/commit/e7d5ddf3f39e7972f88d312db80c8a37117e75d4))
* **syntax:** highlight SORT/MERGE/RELEASE/RETURN, EXPECT comparisons, TERMINAL ([7c02bf5](https://github.com/Landparty/mocky-mock-vscode/commit/7c02bf585ebf04b17625b623b7dce8a3fb410f8f))


### Bug Fixes

* address code-review findings on the earlier bug-fix commit ([77a1be8](https://github.com/Landparty/mocky-mock-vscode/commit/77a1be8b59638c287b295039837d362f48904388))
* address code-review findings on zapp.yml copybook resolution ([fb983a8](https://github.com/Landparty/mocky-mock-vscode/commit/fb983a8ebedc0f714b0aec761032e8f98353513d))
* address eight bugs found in a full-extension code review ([92a6581](https://github.com/Landparty/mocky-mock-vscode/commit/92a65819c73974c3c3972608e7b4e5571b32f5c8))
* address final whole-branch review findings for boundaries removal ([274a786](https://github.com/Landparty/mocky-mock-vscode/commit/274a78655bebad345b2228a63bdf109081bc3140))
* address repo-audit findings (hygiene, lint, deps, docs) ([e602523](https://github.com/Landparty/mocky-mock-vscode/commit/e6025231985086b80eb63ad807bf39701bbc1602))
* address review findings on the CLI working-directory change ([641b777](https://github.com/Landparty/mocky-mock-vscode/commit/641b7777e86076283da918eb2117acd7922ea950))
* **cli:** run the CLI from the file's directory; surface config errors ([95435a3](https://github.com/Landparty/mocky-mock-vscode/commit/95435a3a963f0b1a7eefce028772d10536179792))
* close four more boundary/reconciliation bugs of the same class ([da8ab0a](https://github.com/Landparty/mocky-mock-vscode/commit/da8ab0a3878b1f77ac832469b1553aabc93a81f0))
* cut editor intelligence review follow-ups ([69e48b3](https://github.com/Landparty/mocky-mock-vscode/commit/69e48b3a1b07116610b96e9d642a4d719bddd9ac))
* **debug:** anchor relative launch.json program/cut paths to the workspace ([e4c708a](https://github.com/Landparty/mocky-mock-vscode/commit/e4c708a1c356223e1fe1476885deb7d9fb0761d5))
* **environment:** make the darwin CLI-path fallback test hermetic ([3aed7cf](https://github.com/Landparty/mocky-mock-vscode/commit/3aed7cf491567f8db654fb68bddeced07640fbb0))
* **testing:** surface the run-report signals the JSON path was dropping ([c64e758](https://github.com/Landparty/mocky-mock-vscode/commit/c64e758f4f03e4b45275c93db97994ece621ea0f))
* three bugs surfaced by adversarial re-review of the last commit ([1cebb36](https://github.com/Landparty/mocky-mock-vscode/commit/1cebb36c8a0b9f36713f58237402334fce6c9307))
* update references to cobol-parser in workflow and documentation ([7d4f24c](https://github.com/Landparty/mocky-mock-vscode/commit/7d4f24c0d6b473fecab5a72143aae60bc3d45536))

## [0.11.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.10.0...v0.11.0) (2026-08-14)


### Features

* add mutate CLI arg builder and spawn wrapper ([2a488b5](https://github.com/Landparty/mocky-mock-vscode/commit/2a488b5441e39b6872a539f6f4506ef2c3313864))
* add Mutation Test run profile with survivor diagnostics ([a0db926](https://github.com/Landparty/mocky-mock-vscode/commit/a0db9268c7713df8e3c04af0f8c9b0ded8f3b0cd))
* add Mutation Test run profile with survivor diagnostics ([46367db](https://github.com/Landparty/mocky-mock-vscode/commit/46367db8542290ac3b0883b7c4d929fdfaea5285))
* identify MOVE statement type mismatches as live diagnostics ([8f9c116](https://github.com/Landparty/mocky-mock-vscode/commit/8f9c1160f36e148230d39e987f4b5a6cde211a2c))
* parse mockymock mutate --json-report output ([7ad10a3](https://github.com/Landparty/mocky-mock-vscode/commit/7ad10a35b98c2c7b7683c462a0c54c13ca289327))
* probe CLI support for the mutate subcommand ([211ab76](https://github.com/Landparty/mocky-mock-vscode/commit/211ab7699b8d9dfa81212ae4e7f82352907ef1eb))


### Bug Fixes

* address Copilot review on move-mismatch PR [#59](https://github.com/Landparty/mocky-mock-vscode/issues/59) ([6dd003e](https://github.com/Landparty/mocky-mock-vscode/commit/6dd003e3796f30bf5efd07cf62b050cdf5f1a1da))
* address mutation-testing review comments from Copilot ([32c7b78](https://github.com/Landparty/mocky-mock-vscode/commit/32c7b78f7c3e217b7ba6ddcf638041d5b7401c91))
* close mutation-test false-green and stale-diagnostics gaps ([bd570d2](https://github.com/Landparty/mocky-mock-vscode/commit/bd570d21d111b87801d5e7cb2573788e03f80247))
* guard against a stuck spinner if runMutationFile throws mid-run ([31d8ea3](https://github.com/Landparty/mocky-mock-vscode/commit/31d8ea3677751486e7eb67f0727a6fa3ac0c1422))

## [0.10.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.6...v0.10.0) (2026-08-13)


### Features

* add Focus on SQL/CICS/MQ/CALL Statements command ([4298598](https://github.com/Landparty/mocky-mock-vscode/commit/42985983d6295d9e5846a8dba71abab9230abc8d))


### Bug Fixes

* address Copilot review on focus-statements PR [#56](https://github.com/Landparty/mocky-mock-vscode/issues/56) ([ac40c64](https://github.com/Landparty/mocky-mock-vscode/commit/ac40c64eb01bc46b9a3195386f7415f3054879ca))

## [0.9.6](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.5...v0.9.6) (2026-08-13)


### Bug Fixes

* update GITHUB_READ_PAT references to ORG_PAT in build-and-release workflow ([5d3d943](https://github.com/Landparty/mocky-mock-vscode/commit/5d3d9430a19fdb840221db0283ed751e55105f16))

## [0.9.5](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.4...v0.9.5) (2026-08-13)


### Bug Fixes

* correct stale VSCE_PAT wording in resolve job error messages ([dff17b3](https://github.com/Landparty/mocky-mock-vscode/commit/dff17b3e1ddfdbd26b99026c6ad7cb122993b6d1))
* correct stale VSCE_PAT wording in resolve job error messages ([1a64a69](https://github.com/Landparty/mocky-mock-vscode/commit/1a64a6918e9f3f039a7212637b73fea826b55be6))

## [0.9.4](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.3...v0.9.4) (2026-08-13)


### Bug Fixes

* separate GITHUB_READ_PAT from VSCE_PAT in build-and-release workflow ([0c04221](https://github.com/Landparty/mocky-mock-vscode/commit/0c04221d7d7ef2a6e9783d15d1774bc853777caa))
* use GITHUB_READ_PAT for cross-repo GitHub API access instead of VSCE_PAT ([3d57439](https://github.com/Landparty/mocky-mock-vscode/commit/3d57439e28bff1d97907a94ae250a00f037773f7))

## [0.9.3](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.2...v0.9.3) (2026-08-13)


### Bug Fixes

* crisp program-flow zoom and UTF-8 CLI output decoding ([fe73299](https://github.com/Landparty/mocky-mock-vscode/commit/fe73299e2dff8abcec26606991883a16c9f3b343))
* crisp program-flow zoom and UTF-8 CLI output decoding ([faf1c12](https://github.com/Landparty/mocky-mock-vscode/commit/faf1c122b509b0446068f915febce5136cee38bf))

## [0.9.2](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.1...v0.9.2) (2026-08-13)


### Bug Fixes

* harden CLI invocation, parsers, and process-spawn discipline (audit findings) ([62c2e84](https://github.com/Landparty/mocky-mock-vscode/commit/62c2e846f08c579f8b10dd23420a2b674d6f788c))
* harden CLI invocation, parsers, and process-spawn discipline (audit findings) ([44c9103](https://github.com/Landparty/mocky-mock-vscode/commit/44c9103e62bea79797b88ff81506c86c3bf03ea3))

## [0.9.1](https://github.com/Landparty/mocky-mock-vscode/compare/v0.9.0...v0.9.1) (2026-08-12)


### Bug Fixes

* address review findings from Program Flow reapply ([915d4f5](https://github.com/Landparty/mocky-mock-vscode/commit/915d4f52ea27b59d0930d038e361f4edb7815da9))
* restore VSCE_PAT for cross-repo release token, strengthen label test ([18025c9](https://github.com/Landparty/mocky-mock-vscode/commit/18025c9481ab7c7e161c7882bf36fb7d69737f1c))
* stop mispainting lint diagnostics on .cbl-relative line numbers ([0c0aad6](https://github.com/Landparty/mocky-mock-vscode/commit/0c0aad6b2bdad9841f171dd8cd778d03a2a952e0))
* stop mispainting lint diagnostics on .cbl-relative line numbers ([b3281d2](https://github.com/Landparty/mocky-mock-vscode/commit/b3281d2b4abed358c2ef78d1297a56e8b8ab0801))

## [0.9.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.8.0...v0.9.0) (2026-08-11)


### Features

* add COBOL outline model (DIVISION/SECTION/paragraph/data-item scan) ([a020cd8](https://github.com/Landparty/mocky-mock-vscode/commit/a020cd8e7347853e6375c25e8064e4890e8c1b28))
* add copybook detection heuristic ([b637a13](https://github.com/Landparty/mocky-mock-vscode/commit/b637a13f8170ae32bd68c62abb7d91d39c1220a5))
* add Generate Data from Copybook command to editor title bar ([01c78ec](https://github.com/Landparty/mocky-mock-vscode/commit/01c78ec46166fb62dedbe305bd294c5dc0d663bd))
* add generate-data CLI runner ([d29a517](https://github.com/Landparty/mocky-mock-vscode/commit/d29a517485c0b68eb7a61f8e3bb5cbb1d7202709))
* register COBOL DocumentSymbolProvider for the Outline panel/breadcrumbs ([d7b9131](https://github.com/Landparty/mocky-mock-vscode/commit/d7b9131caa04b6cc3163c658b00e3cb2fc6d52fe))
* register Generate Data from Copybook command ([1c30770](https://github.com/Landparty/mocky-mock-vscode/commit/1c30770c82855e0f42f995489378811fa67a53b5))


### Bug Fixes

* activate extension for COBOL-only workspaces without spamming the status bar ([c5d655d](https://github.com/Landparty/mocky-mock-vscode/commit/c5d655d1aca5ec872d2432fa54fc138b0faca367))
* address Copilot PR review comments ([a037207](https://github.com/Landparty/mocky-mock-vscode/commit/a037207124cf9bfbad6dfe071876af24c76d2ef1))
* address final review findings (cpy activation, gen-data capability probe, context-key drift test, palette guard) ([5f4f378](https://github.com/Landparty/mocky-mock-vscode/commit/5f4f378057613ad02a0ae89bd0f62f4aa4533861))
* extend outline paragraph exclusions and harden resolveProgramName ([7093de4](https://github.com/Landparty/mocky-mock-vscode/commit/7093de47ba424f27977c4e9cde733b2afc679e30))
* recognize floating *&gt; comments and ID DIVISION abbreviation in outline ([5c81cb4](https://github.com/Landparty/mocky-mock-vscode/commit/5c81cb4b2e76556824496e59382a8de3d15bc97e))

## [0.8.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.7.4...v0.8.0) (2026-08-11)


### Features

* record cobolparser version and pull its latest release in build-and-release ([40be121](https://github.com/Landparty/mocky-mock-vscode/commit/40be1213f28e4aced208b514e32dd9d07464251c))


### Bug Fixes

* hide COBOL side views until a COBOL file is open ([3e8b0e2](https://github.com/Landparty/mocky-mock-vscode/commit/3e8b0e26c7e0e431c59965d6cd68667dec683458))
* hide COBOL side views until a COBOL file is open ([ad1b094](https://github.com/Landparty/mocky-mock-vscode/commit/ad1b0946d734a774ff6ef4b66416596dc8335f00))
* rewrite release-notes provenance lines instead of append-if-missing ([7842e1b](https://github.com/Landparty/mocky-mock-vscode/commit/7842e1b74322b2dec8e5343c285f022fb4f66548))
* stop filtering open-COBOL-tab check to scheme === 'file' ([d941cb8](https://github.com/Landparty/mocky-mock-vscode/commit/d941cb8729179fc573505fa4f2554973790b2da3))

## [0.7.4](https://github.com/Landparty/mocky-mock-vscode/compare/v0.7.3...v0.7.4) (2026-08-10)


### Bug Fixes

* address PR review feedback on Docker launch failure messaging ([022ef61](https://github.com/Landparty/mocky-mock-vscode/commit/022ef61545ecbda26f552d2a47698e70efe979a5))
* stop double-quoting the Windows Docker Desktop launch path ([53ac144](https://github.com/Landparty/mocky-mock-vscode/commit/53ac1442965156e4c16fb8fff3019de200cd39a8))
* stop double-quoting the Windows Docker Desktop launch path ([cb4377a](https://github.com/Landparty/mocky-mock-vscode/commit/cb4377a4ff4ed0672823e13b2f2fb9f442dd89a6))

## [0.7.3](https://github.com/Landparty/mocky-mock-vscode/compare/v0.7.2...v0.7.3) (2026-08-10)


### Bug Fixes

* improve macOS support (Gatekeeper, Intel build, PATH resolution) ([248fecf](https://github.com/Landparty/mocky-mock-vscode/commit/248fecf7a013dd844650f53e6bf030fba83e7fa9))
* replace broken margin-compensation with CSS Grid for tree columns ([329f55c](https://github.com/Landparty/mocky-mock-vscode/commit/329f55c8753bf67c1bb351ba80eabcae07cf25fd))
* switch paragraph tree layout to CSS Grid, undoing the broken margin-compensation attempt ([8f9c009](https://github.com/Landparty/mocky-mock-vscode/commit/8f9c009e04b72462dcc4b7d54982ec634c7923e5))

## [0.7.2](https://github.com/Landparty/mocky-mock-vscode/compare/v0.7.1...v0.7.2) (2026-08-10)


### Bug Fixes

* align paragraph tree columns and add F/S/C column header ([87d11ad](https://github.com/Landparty/mocky-mock-vscode/commit/87d11ad6d347f878789d926d42633105e84907dc))
* align Paragraph Tree columns, add F/S/C column header ([d62b697](https://github.com/Landparty/mocky-mock-vscode/commit/d62b6977fb0e508157f1259c170e3c06c02f3648))

## [0.7.1](https://github.com/Landparty/mocky-mock-vscode/compare/v0.7.0...v0.7.1) (2026-08-09)


### Bug Fixes

* don't fail-close on ENTRY-statement pseudo-entry-points ([1dc79d8](https://github.com/Landparty/mocky-mock-vscode/commit/1dc79d81eb750fb8e6c477a9213f9a4d07c597c8))
* don't fail-close the Paragraph Tree on ENTRY-statement pseudo-entries ([9b9c336](https://github.com/Landparty/mocky-mock-vscode/commit/9b9c336acf3958f5214c76e109924872f39c29df))

## [0.7.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.6.0...v0.7.0) (2026-08-09)


### Features

* add Paragraph Tree webview ([80c4213](https://github.com/Landparty/mocky-mock-vscode/commit/80c4213a9a99be98114326e156f150ff432337c1))


### Bug Fixes

* address final review findings on Paragraph Tree (PR [#22](https://github.com/Landparty/mocky-mock-vscode/issues/22)) ([5c6c25f](https://github.com/Landparty/mocky-mock-vscode/commit/5c6c25fd87855c56d4605bc6153a56b5596041e1))
* drop invalid runner-context reference in build-vsix's job-level env ([7ef0cc0](https://github.com/Landparty/mocky-mock-vscode/commit/7ef0cc0d53a06c7877ddffed014e8efefe3585f9))
* update CI packaging guard for the paragraph-tree webview bundle ([31e59c7](https://github.com/Landparty/mocky-mock-vscode/commit/31e59c7a5bd9719b0e2ec4185e9562d270563dc3))

## [0.6.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.5.0...v0.6.0) (2026-08-09)


### Features

* add analysisRunner for the mockymock analyze passthrough ([66fbb95](https://github.com/Landparty/mocky-mock-vscode/commit/66fbb95ca5c1dc75664d9fab21177e2f9532308f))
* add Analyze COBOL File command ([4b09683](https://github.com/Landparty/mocky-mock-vscode/commit/4b09683ec3987ea8fde018a7b274a38e72085b5e))
* add supportsAnalyzeCommand capability probe ([9484554](https://github.com/Landparty/mocky-mock-vscode/commit/94845540e5b14553251dd5efcfcb57382783a2e9))


### Bug Fixes

* close release-clobber guard gap + final-review nits ([c5d0840](https://github.com/Landparty/mocky-mock-vscode/commit/c5d08402698270e3368b29f64f341967eac0f62f))
* correct artifact staging path and missing dist dir in build-vsix ([757ecfd](https://github.com/Landparty/mocky-mock-vscode/commit/757ecfdf48a2fe990b0acba7f8cb284fa40a7cf0))
* distinguish missing CLI from too-old CLI; dispose analysis output channel ([5c230fd](https://github.com/Landparty/mocky-mock-vscode/commit/5c230fd96bc9e78df8387194eb9226e534819484))
* surface stderr warnings and clear stale output on every analyze run ([28e79d2](https://github.com/Landparty/mocky-mock-vscode/commit/28e79d20dd0cb45ece2fe0705aab93d123e0d91e))
* use one resource-scoped config for executablePath and copybookPaths in analyzeCobol ([69b4b12](https://github.com/Landparty/mocky-mock-vscode/commit/69b4b127a75f4eee566e964b41104f55771473d1))

## [0.5.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.4.2...v0.5.0) (2026-08-07)


### Features

* **boundaries:** bundleClient fetches and validates FixtureBundle JSON ([4841d17](https://github.com/Landparty/mocky-mock-vscode/commit/4841d17d25e3378f64ad0f792439b60d34b41552))
* **boundaries:** Generate .cut action wired to generate --with-data ([0ef7c9a](https://github.com/Landparty/mocky-mock-vscode/commit/0ef7c9ac1860ca524e48986e5f377d153dff1c6b))
* **boundaries:** surface the CLI-drawn seed for replayable runs ([802fe1a](https://github.com/Landparty/mocky-mock-vscode/commit/802fe1ac3e2cc86b34929bd6ad3018998ef7c85a))
* **boundaries:** tree view over mockymock fixtures bundle ([0904063](https://github.com/Landparty/mocky-mock-vscode/commit/09040631ffc7e4a73f87f1602aa821545dbc2434))
* **boundaries:** view model with checkbox state and placeholder derivation ([4d01970](https://github.com/Landparty/mocky-mock-vscode/commit/4d019707895295f8f42f2a63f973b109f1dfcd09))
* **syntax:** add TextMate grammar for IBM Enterprise COBOL ([5c85dde](https://github.com/Landparty/mocky-mock-vscode/commit/5c85dde1936106cd34343a8a22d66eda0e234635))
* **syntax:** add TextMate grammar for IBM Enterprise COBOL ([d8548d7](https://github.com/Landparty/mocky-mock-vscode/commit/d8548d77e4f263fa0e6d6496050c851b5869e7d6))


### Bug Fixes

* **boundaries:** close persistence-key race and OCCURS field-id collision ([481dc1d](https://github.com/Landparty/mocky-mock-vscode/commit/481dc1d4fba7960e00101043bcb56fc29d3c3006))
* **boundaries:** don't let a --placeholder warning mask a generate refusal ([37dca59](https://github.com/Landparty/mocky-mock-vscode/commit/37dca59da03a02535e0f2407b795747dc449fbd4))
* **boundaries:** fix final-review findings (view state, pinning, error label) ([f7c5768](https://github.com/Landparty/mocky-mock-vscode/commit/f7c5768b6e6763bbc346eaef29132db5606c3d04))
* **boundaries:** render CALL/DYNCALL rows without a badge instead of "undefined" ([15d74ad](https://github.com/Landparty/mocky-mock-vscode/commit/15d74ad611b84b00f01bfea0f0833ab62cdcd053))
* **boundaries:** surface OUT-only boundaries, close review nits ([e4b07f7](https://github.com/Landparty/mocky-mock-vscode/commit/e4b07f72ef9b52eab96e5f80048f5849fa743e30))
* **deps:** bump mockymock CLI to v0.3.0 ([819d4d3](https://github.com/Landparty/mocky-mock-vscode/commit/819d4d3197dfdfcaf30f92d6e8a55006daf80c31))
* **deps:** bump mockymock CLI to v0.3.0 ([59241ed](https://github.com/Landparty/mocky-mock-vscode/commit/59241ed85df8e5047fdb417775eea9ceac1733a9))
* **deps:** bump mockymock CLI to v0.4.0 ([ea21daa](https://github.com/Landparty/mocky-mock-vscode/commit/ea21daa4cc11bf340b1406b4d0558a464f9b23d2))
* **deps:** bump mockymock CLI to v0.4.0 ([65af5c5](https://github.com/Landparty/mocky-mock-vscode/commit/65af5c53d1500861460e5ae3d3ed78f9c7c8c26c))
* **scripts:** try multiple mocky-mock CLI checkout candidates for integration tests ([5435bcf](https://github.com/Landparty/mocky-mock-vscode/commit/5435bcfeced439d245e373f4bf4e055fb246a4f8))
* **syntax:** tokenize signed numeric literals, fix stale comment ([2d7ee69](https://github.com/Landparty/mocky-mock-vscode/commit/2d7ee69167f334381eeacfd8e9e830f7fe3397ae))

## [0.4.2](https://github.com/Landparty/mocky-mock-vscode/compare/v0.4.1...v0.4.2) (2026-08-04)


### Bug Fixes

* update publisher name from 'legacylens' to 'lanparty' in package.json ([74b5693](https://github.com/Landparty/mocky-mock-vscode/commit/74b5693d839745588ef02860b4e440bcccf5db1f))

## [0.4.1](https://github.com/Landparty/mocky-mock-vscode/compare/v0.4.0...v0.4.1) (2026-08-04)


### Bug Fixes

* verify pinned CLI release has release.yml's required assets ([acd189c](https://github.com/Landparty/mocky-mock-vscode/commit/acd189c5a80463c2cbbd893e0416786ce2087447))

## [0.4.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.3.0...v0.4.0) (2026-08-04)


### Features

* add Export Mainframe-Ready COBOL command ([5093b2c](https://github.com/Landparty/mocky-mock-vscode/commit/5093b2c77dbb5c636735085a97a8b57bcd661e6a))
* add mockymock.exportMainframe command ([b874c7f](https://github.com/Landparty/mocky-mock-vscode/commit/b874c7fff6f62e4d3bab632f3906ce3edd685d9e))
* register Export Mainframe-Ready COBOL in the command palette ([4931239](https://github.com/Landparty/mocky-mock-vscode/commit/49312393f918c8572904a04ae1ae3dd2c9b70211))


### Bug Fixes

* add cacheSeconds parameter to download badge in README ([396fca8](https://github.com/Landparty/mocky-mock-vscode/commit/396fca89e44e1357662379ff7ea0d09b4ab79b10))
* address final whole-branch review findings for mainframe export command ([e72c827](https://github.com/Landparty/mocky-mock-vscode/commit/e72c8275b80bfaa703526174a63331c8aafd5fac))

## [0.3.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.2.0...v0.3.0) (2026-08-03)


### Features

* add CI-bundled mockymock CLI binary and update documentation ([2c2fd53](https://github.com/Landparty/mocky-mock-vscode/commit/2c2fd53f8c0583eb054716f8bf045da2d7e5e28b))


### Bug Fixes

* add missing repository field in package.json ([443598a](https://github.com/Landparty/mocky-mock-vscode/commit/443598a01788906912efae5745a41a23ca7bcbf0))
* correct typo in .gitignore for docs/ entry ([1e656a0](https://github.com/Landparty/mocky-mock-vscode/commit/1e656a096da3ba6128235d8a02df146539a0e5bf))
* remove duplicate entry for docs/ in .gitignore ([b1cddde](https://github.com/Landparty/mocky-mock-vscode/commit/b1cddde5167858afb19a68aeb709128ebc70b84d))

## [0.2.0](https://github.com/Landparty/mocky-mock-vscode/compare/v0.1.0...v0.2.0) (2026-08-03)


### Features

* add environment readiness decision functions ([6b1d01e](https://github.com/Landparty/mocky-mock-vscode/commit/6b1d01efe9c402ba8ccc2fcf8a1f73efc2fe72a2))
* add EnvironmentManager for mockymock/Docker bootstrap ([e05fa29](https://github.com/Landparty/mocky-mock-vscode/commit/e05fa29bbb2f903fa69b432bd58a3e9773d36f0e))
* build and execute the mockymock run invocation ([646b017](https://github.com/Landparty/mocky-mock-vscode/commit/646b01725f155865efda49c5c25f4c96d9a9a5f3))
* bundle mockymock's example COBOL programs into the extension ([f596634](https://github.com/Landparty/mocky-mock-vscode/commit/f59663452411c45829804a354b274218b12c04d2))
* **cut:** implement provider-based parameterized test cases ([4bbe34b](https://github.com/Landparty/mocky-mock-vscode/commit/4bbe34ba01ab262a0ab5d43c4f5ba38737e8bb66))
* **debug:** add DebugAdapterDescriptorFactory and configuration provider ([5073c05](https://github.com/Landparty/mocky-mock-vscode/commit/5073c05158428e9a468fc5a0423059e5b60b8d77))
* **debug:** add mockymock lint preflight to interactive debugging ([1c89629](https://github.com/Landparty/mocky-mock-vscode/commit/1c89629cc5e61d0c839dfe168b5dce2fcbfee664))
* **debug:** add mockymock lint preflight to the interactive debug session ([33a9731](https://github.com/Landparty/mocky-mock-vscode/commit/33a9731ea54a194d383c05f2e1e4d9669170c4aa))
* **environment:** add supportsDebugCommand capability preflight ([3a7db49](https://github.com/Landparty/mocky-mock-vscode/commit/3a7db49edc8264de13955b02f3b85d9b5338bc3a))
* **environment:** add supportsTraceFlag capability preflight ([a901ea0](https://github.com/Landparty/mocky-mock-vscode/commit/a901ea0090a1aceef133cc61d817cbacf3b7aca3))
* **environment:** resolveExecutablePath checks for a bundled CLI binary ([f560234](https://github.com/Landparty/mocky-mock-vscode/commit/f56023414efe77db083cbd33809f8132b62c4ac6))
* **environment:** thread extensionPath to every resolveExecutablePath call site ([c1e360a](https://github.com/Landparty/mocky-mock-vscode/commit/c1e360acbba4541bfe8a6995753e7ee051430dc5))
* map JUnit results onto expected test case names ([34240cf](https://github.com/Landparty/mocky-mock-vscode/commit/34240cf5fdfd8dc50c59bdff5ed35a33c93f230f))
* parse mockymock's JUnit XML output ([b0229c1](https://github.com/Landparty/mocky-mock-vscode/commit/b0229c1c8d3a1b96fcca45a6b0ca258d4fee3923))
* parse TESTSUITE/TESTCASE names from .cut files ([4a25eca](https://github.com/Landparty/mocky-mock-vscode/commit/4a25eca16fbd8c435798ee8ba9b56d79ed33d4cb))
* pytest-grade test experience -- per-case runs, inline diffs, coverage, continuous run, lint, .cut language ([9b495d8](https://github.com/Landparty/mocky-mock-vscode/commit/9b495d8b91d9b90ca57008237900d94027f6ac25))
* **testing:** add Debug (Execution Trace) test run profile ([a0af846](https://github.com/Landparty/mocky-mock-vscode/commit/a0af846a1ff38b8c856a99060c23df97fc862f80))
* **testing:** add Debug (Interactive) test run profile ([beb2111](https://github.com/Landparty/mocky-mock-vscode/commit/beb2111400cf6da42a8b126794f25f8ae37d0f1f))
* **testing:** add trace-JSON parser and console-style renderer ([895f404](https://github.com/Landparty/mocky-mock-vscode/commit/895f4048f1ce66ce5739b6bc6c7faa147970eaf0))
* **testing:** plumb --trace-json through buildRunArgs and runSuite ([496ed1d](https://github.com/Landparty/mocky-mock-vscode/commit/496ed1d6c8076fdf810cc0a28410d81d7f561c6e))
* wire the Test Controller into extension activation ([6b5f412](https://github.com/Landparty/mocky-mock-vscode/commit/6b5f412e7a99cb816ea23ee332e2f2d53e17e2b3))


### Bug Fixes

* address final review findings (staging leakage, vsix filenames, docs, test coverage) ([ce90087](https://github.com/Landparty/mocky-mock-vscode/commit/ce90087aafefd6574065c76addb810eac90cced8))
* address final whole-branch review findings (Docker detection, arg quoting, install re-verify) ([870c9b0](https://github.com/Landparty/mocky-mock-vscode/commit/870c9b00aff03b6766ea55ada07ffe8cd446806f))
* address Task 8 test controller review findings ([cdab942](https://github.com/Landparty/mocky-mock-vscode/commit/cdab942a45e7d3ea037e65e9acbdf30544c3b80b))
* **debug:** cover evaluateLintResult's no-code/no-line branch, note case scope ([f669cc8](https://github.com/Landparty/mocky-mock-vscode/commit/f669cc89c278306e8ab99e864235b6370f228aae))
* **debug:** enable breakpoints on .cbl COBOL source ([820e7a2](https://github.com/Landparty/mocky-mock-vscode/commit/820e7a25d292b675af20821a88428a6f72a001c3))
* exclude .superpowers/ scratch directory from packaged .vsix ([b2432fc](https://github.com/Landparty/mocky-mock-vscode/commit/b2432fc912bfcce45e89d5bd90bbeff2e09f89f5))
* scope CI workflow token permissions ([3d19f85](https://github.com/Landparty/mocky-mock-vscode/commit/3d19f85766abde27bfcb7eb4ad3cbfb7dabddfbc))
* surface unattributed test failures, wire status bar click to a real action ([0475999](https://github.com/Landparty/mocky-mock-vscode/commit/0475999807fb966b5862eb10551bcafdbd13ae62))
