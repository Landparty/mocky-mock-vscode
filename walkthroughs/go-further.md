## Coverage

Choose **Run with Coverage** from the dropdown next to the run button. Executed lines are painted green and missed lines red directly on your `.cbl`, and the **Test Coverage** view shows the percentage per file.

## Mutation testing

Choose **Mutation Test** from the same dropdown. mockymock re-runs your suite against many single-line variants of your program (a flipped `>` to `>=`, a deleted `MOVE`) and reports each one your tests failed to notice, as a warning on the exact `.cbl` line. Expect minutes, not seconds, on a large program.

## Understanding a program

Right-click any COBOL file for **New Test Suite for This Program**.

For reading the program itself -- COBOL syntax highlighting, an Outline of
divisions, sections and paragraphs, Go to Definition, a Paragraph Tree, a
Program Flow diagram, and the static analyzers (dead code, I/O sequence,
MOVE type checks, linkage checks and more) -- install the companion
**COBOL Analyzer** extension. The two work well side by side: this one owns
`.cut` test suites, that one owns COBOL language support and analysis.

## Taking tests to the mainframe

**mockymock: Export Mainframe-Ready COBOL** writes the instrumented test build as fixed-format source adjusted for an IBM z/OS compiler.

## Worked examples

The extension repository ships 13 example programs with suites covering every boundary type: files, DB2, CICS, IMS DL/I, MQ, dynamic CALL and data-driven cases. Each has its own README.
