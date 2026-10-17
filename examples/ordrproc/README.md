# ORDRPROC example

A minimal program that calls an external `DISCRATE` subprogram to get a
discount rate, then computes a net amount. Demonstrates a static `CALL`
mock plus `CAPTURE ARG <n> INTO <target>` — capturing the real
`ORD-AMOUNT` value the program passed into `DISCRATE`, asserted with an
ordinary `EXPECT`.

```bash
mockymock run ORDRPROC.cbl --cut ORDRPROC.cut
```

Try changing `EXPECT WS-CAPTURED-AMOUNT TO BE 100.00` to a wrong value
and re-running to see a FAIL case, or `mockymock generate ORDRPROC.cbl`
to see what auto-scaffolding produces for this program from scratch
(it scaffolds `CAPTURE ARG n INTO UT-CAP-...` for each `CALL` argument, with
a `*> STUB EXPECT` comment for each one for you to turn into a real `EXPECT`).
