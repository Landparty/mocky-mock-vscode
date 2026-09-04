## Coverage

Choose **Run with Coverage** from the dropdown next to the run button. Executed lines are painted green and missed lines red directly on your `.cbl`, and the **Test Coverage** view shows the percentage per file.

## Mutation testing

Choose **Mutation Test** from the same dropdown. mockymock re-runs your suite against many single-line variants of your program (a flipped `>` to `>=`, a deleted `MOVE`) and reports each one your tests failed to notice, as a warning on the exact `.cbl` line. Expect minutes, not seconds, on a large program.

## Understanding a program

Right-click any COBOL file for:

- **New Test Suite for This Program**
- **mockymock: Analyze COBOL** -- dead code, I/O sequence, MOVE type checks, linkage checks, and more
- **Show Program Flow** -- a diagram of PERFORM / GO TO / CALL relationships, with a **Paragraph Tree** view alongside it in the Explorer

The **Outline** panel and breadcrumbs understand divisions, sections, paragraphs and data items, and **Go to Definition** works on paragraph names.

## Taking tests to the mainframe

**mockymock: Export Mainframe-Ready COBOL** writes the instrumented test build as fixed-format source adjusted for an IBM z/OS compiler.

## Worked examples

The extension repository ships 13 example programs with suites covering every boundary type: files, DB2, CICS, IMS DL/I, MQ, dynamic CALL and data-driven cases. Each has its own README.
