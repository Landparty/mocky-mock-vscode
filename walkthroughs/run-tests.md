## Running tests

Open the **Testing** view in the Activity Bar (the flask icon). Every `.cut` file in your workspace is listed, with its suite and test cases underneath.

- **Run one test:** click the play button next to it, or the green arrow in the editor gutter beside its `TESTCASE` line.
- **Run everything:** the play button at the top of the Test Explorer.
- **Re-run only failures:** the "Rerun Failed Tests" button after a run.
- **Continuous run:** click the eye icon on a test to re-run it automatically every time you save the `.cut` or the `.cbl`.

## Reading a failure

A failed `EXPECT` is underlined on its line in the `.cut` file, with an inline expected/actual diff. Hover it, or open the **Test Results** panel for the full output of the run.

## Before you run: lint

Every time you open or save a `.cut` file, mockymock checks it statically and reports problems in the **Problems** panel. This needs no Docker and catches typos in paragraph names, unmockable boundaries, and bad syntax before a run ever starts.
