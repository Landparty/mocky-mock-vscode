## Your first `.cut` file

A test suite is a plain-text `.cut` file named after the program it tests:
`ORDRPROC.cbl` gets `ORDRPROC.cut` in the same folder.

Each `TESTCASE` does three things: set up inputs with `MOVE`, run one paragraph with `PERFORM`, then check results with `EXPECT`. Anything the paragraph calls out to (a `CALL`, a file read, an SQL statement) is replaced by a `MOCK` block you control.

```cobol
TESTSUITE "ORDRPROC discount calculation"

TESTCASE "10% discount reduces net amount"
    MOCK CALL "DISCRATE"
        MOVE 0.10 TO WS-DISCOUNT-PCT
    END-MOCK
    MOVE 100.00 TO ORD-AMOUNT
    PERFORM PROCESS-ORDER
    EXPECT WS-NET-AMOUNT TO BE 90.00
    VERIFY "DISCRATE" WAS CALLED ONCE
```

## Three ways to create one

- Click the **beaker icon** in the editor title bar of any open COBOL program.
- Right-click inside a COBOL program and choose **New Test Suite for This Program**.
- Use the **Create a Test Suite** button in an empty Test Explorer.

The generated suite is runnable as-is. Fill in the `MOVE` and `EXPECT` lines, and type `testcase`, `mock-call` or `expect` for snippets while you edit.
