       IDENTIFICATION DIVISION.
      * Fixture for cliContract.test.ts: the COPY member below is
      * deliberately absent from every copybook path, so `mockymock lint`
      * refuses with UNRESOLVED_COPYBOOK. Used to check that the
      * extension's refusal parser still understands the CLI's real
      * refusal wording -- do NOT add a NOSUCHBOOK copybook to this repo.
       PROGRAM-ID. UNRESOLVED.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY NOSUCHBOOK.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "UNREACHABLE".
