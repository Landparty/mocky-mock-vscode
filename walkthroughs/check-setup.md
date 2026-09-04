## What "Check Setup" does

1. **Finds the mockymock CLI.** Release builds of this extension bundle it, so there is normally nothing to install. If it is missing, the extension installs it with `uv`.
2. **Checks Docker.** mockymock compiles and runs your COBOL with GnuCOBOL inside a Docker container. If Docker Desktop is installed but not running, it is started for you.

The result shows in the status bar at the bottom of the window:

| Status bar | Meaning |
|---|---|
| `✓ mockymock: ready` | Everything works. Go write a test. |
| `⚠ mockymock: Docker not running` | Click it to start Docker Desktop. |
| `⚠ mockymock: Docker not installed` | Click it for the download page. |
| `⚠ mockymock: CLI not found` | Click it to install the CLI. |

You can re-run this at any time from the Command Palette:
**mockymock: Check Setup (CLI and Docker)**.

> **Tip:** Docker is only needed to *run* tests. Creating a suite, linting it, and the COBOL analyzers all work without it.
