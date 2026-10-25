#!/usr/bin/env bash
# Fetches the GnuCOBOL tree the win32-x64 vsix carries under gnucobol/, so
# mockymock runs tests natively on Windows with no Docker (mocky-mock's
# runtime/native_toolchain.py; the extension points it here through
# MOCKYMOCK_GNUCOBOL_HOME, see src/environment/bundledToolchain.ts).
#
# Usage: scripts/fetch-gnucobol-windows.sh <output-dir>
# Writes <output-dir>/gnucobol/ and <output-dir>/gnucobol-3.2.tar.xz (the
# GnuCOBOL source, attached to the GitHub release as for the Linux tree).
#
# The build is the one the Chocolatey `gnucobol` package installs: its
# tools/chocolateyinstall.ps1 (package 3.2.0.20240515) downloads exactly this
# URL and checks exactly this SHA-256. It is Arnold Trembley's MinGW build of
# GnuCOBOL 3.2 (32-bit, gcc 9.2, with gcov and gdb, Berkeley DB for indexed
# files, GMP, cJSON; no libxml2). Unlike the Linux tree it carries its own C
# compiler, so a Windows user needs nothing else installed. It keeps config/,
# copy/ and extras/ at the root rather than under share/gnucobol/; mockymock
# looks in both places.
#
# Needs curl and 7z (p7zip; preinstalled on GitHub's ubuntu runners).
set -euo pipefail

OUT="${1:?usage: fetch-gnucobol-windows.sh <output-dir>}"
CHOCO_VERSION=3.2.0.20240515
URL=https://arnoldtrembley.com/GC32-BDB-rename-7z-to-exe.7z
SHA256=095c6c0f5b4bfa6d2609ae90d26e184510cb5a24b7644a4fb62ab7a6f9e7b2dc
SRC_VERSION=3.2
SRC_SHA256=3bb48af46ced4779facf41fdc2ee60e4ccb86eaa99d010b36685315df39c2ee2
SRC_URL="https://downloads.sourceforge.net/project/gnucobol/gnucobol/${SRC_VERSION}/gnucobol-${SRC_VERSION}.tar.xz"

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ARCHIVE="$WORK/gnucobol-win.7z"
curl -fsSL -o "$ARCHIVE" "$URL"
[ "$(sha256 "$ARCHIVE")" = "$SHA256" ] || { echo "$URL: sha256 mismatch (expected $SHA256, Chocolatey gnucobol $CHOCO_VERSION)" >&2; exit 1; }

TARBALL="$OUT/gnucobol-${SRC_VERSION}.tar.xz"
[ -f "$TARBALL" ] || curl -fsSL -o "$TARBALL" "$SRC_URL"
[ "$(sha256 "$TARBALL")" = "$SRC_SHA256" ] || { echo "gnucobol-${SRC_VERSION}.tar.xz: sha256 mismatch" >&2; exit 1; }

7z x -y -o"$WORK/x" "$ARCHIVE" >/dev/null
# The tree is the directory holding bin/cobc.exe, whether the archive has it
# at its top level or under one folder.
COBC="$(find "$WORK/x" -ipath '*/bin/cobc.exe' | head -1)"
[ -n "$COBC" ] || { echo "no bin/cobc.exe in $URL" >&2; exit 1; }
ROOT="$(dirname "$(dirname "$COBC")")"
for dir in config copy; do
  [ -d "$ROOT/$dir" ] || { echo "no $dir/ in the GnuCOBOL tree" >&2; exit 1; }
done
[ -f "$ROOT/config/default.conf" ] || { echo "no config/default.conf in the GnuCOBOL tree" >&2; exit 1; }

TREE="$OUT/gnucobol"
rm -rf "$TREE"
mv "$ROOT" "$TREE"

mkdir -p "$TREE/licenses"
tar -xJf "$TARBALL" -C "$WORK" "gnucobol-${SRC_VERSION}/COPYING" "gnucobol-${SRC_VERSION}/COPYING.LESSER"
cp "$WORK/gnucobol-${SRC_VERSION}/COPYING" "$TREE/licenses/GnuCOBOL-COPYING"
cp "$WORK/gnucobol-${SRC_VERSION}/COPYING.LESSER" "$TREE/licenses/GnuCOBOL-COPYING.LESSER"
# The archive carries GnuCOBOL's own COPYING texts only; the notices for
# every other component it ships (GMP, Berkeley DB, GCC, MinGW, ...) live in
# this repo, with a README naming each one's version, license and source.
cp "$(dirname "$0")/../licenses/gnucobol-windows/"* "$TREE/licenses/"

du -sh "$TREE"
