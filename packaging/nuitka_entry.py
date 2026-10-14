"""Entry point for the Nuitka-compiled mockymock executable bundled in the vsix.

Lives outside the mockymock package (which build-and-release.yml installs
from PyPI) for the same reason as mocky-mock's own packaging/nuitka_entry.py:
Nuitka runs the file it compiles as __main__ with no package context, so a
compiled entry point inside the package would break on any relative import.
"""

from mockymock.cli.main import main

if __name__ == "__main__":
    raise SystemExit(main())
