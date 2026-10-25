## What "Check Setup" does

1. **Finds the mockymock CLI.** Release builds of this extension bundle it, so there is normally nothing to install. If it is missing, the extension installs it with `uv`.
2. **Checks GnuCOBOL.** On Linux x64 the extension bundles GnuCOBOL, and Check Setup only makes sure a C compiler (`gcc`) is installed for it. Elsewhere mockymock compiles and runs your COBOL with GnuCOBOL inside a Docker container; if Docker Desktop is installed but not running, it is started for you.

The result shows in the status bar at the bottom of the window:

| Status bar | Meaning |
|---|---|
| `✓ mockymock` | Everything works. Go write a test. |
| `⚠ mockymock: start Docker` | Click it to start Docker Desktop. |
| `⚠ mockymock: Docker needed` | Click it for the download page. |
| `⚠ mockymock: CLI not found` | Click it to install the CLI. |
| `⊗ mockymock: CLI blocked` | The OS refused to run the CLI. Click it for the fix. |
| `⚠ mockymock: GnuCOBOL not ready` | The bundled GnuCOBOL can't compile yet (usually no `gcc`). Hover for what to install. |

Anything that needs your attention is highlighted in the warning or error colour. Hover the item for what's wrong, plus quick links to Check Setup, this guide and the settings.

You can re-run this at any time from the Command Palette:
**mockymock: Check Setup (CLI and Docker)**.

> **Tip:** Docker (or the bundled GnuCOBOL) is only needed to *run* tests. Creating a suite and linting it work without it.
