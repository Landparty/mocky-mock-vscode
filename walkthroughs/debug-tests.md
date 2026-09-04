## Two ways to debug

**Debug (Interactive)** is the default debug profile. It starts a real debug session on your original `.cbl`:

1. Open the `.cbl` and click in the gutter to set a breakpoint.
2. In the Test Explorer, right-click a single test case and choose **Debug Test**.
3. Step through the paragraph, inspect **Variables**, and add **Watch** expressions like any other language.

**Debug (Execution Trace)** is read-only and fast: it runs one test case and prints the paragraphs executed, in order, plus every mock that fired. Pick it from the dropdown next to the debug button in the Test Explorer.

Both debug one test case at a time. Selecting several will ask you to narrow the selection.

> **Tip:** the trace is the quickest answer to "why did my mock not fire?" and "which branch did this take?".
