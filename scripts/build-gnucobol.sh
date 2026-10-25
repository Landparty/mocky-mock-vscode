#!/usr/bin/env bash
# Builds the relocatable GnuCOBOL 3.2 tree a platform vsix carries under
# gnucobol/, so mockymock runs tests natively with no Docker install (the CLI
# side is mocky-mock's runtime/native_toolchain.py; the extension points it
# here through MOCKYMOCK_GNUCOBOL_HOME, see src/environment/bundledToolchain.ts).
#
# Usage: scripts/build-gnucobol.sh <output-dir>
# Writes <output-dir>/gnucobol/ (bin, lib, include, share/gnucobol, licenses)
# and <output-dir>/gnucobol-3.2.tar.xz, the exact source it was built from:
# the GPL's corresponding source, attached to the GitHub release next to the
# vsix files (see build-and-release.yml and THIRD-PARTY-NOTICES.md).
#
# Linux only for now (macOS and Windows: see PUBLISHING.md, "Bundled GnuCOBOL"). Needs
# a C toolchain plus the GMP and Berkeley DB development files
# (Debian/Ubuntu: libgmp-dev libdb-dev). Extra CPPFLAGS/LDFLAGS in the
# environment are passed through, for headers and libraries outside the
# default search path. The tree runs on any Linux whose glibc is at least
# the build machine's, so release builds use an old distribution
# (build-and-release.yml builds in debian:11).
#
# Why everything is relocatable without patching binaries: cobc and libcob
# bake absolute install paths in, but each one has an environment override
# (COB_CONFIG_DIR, COB_COPY_DIR, COB_CFLAGS, COB_LDFLAGS, COB_LIBS,
# COB_LIBRARY_PATH, and the loader's library path) and mockymock sets all of
# them from the tree's location at run time.
set -euo pipefail

[ "$(uname -s)" = Linux ] || { echo "build-gnucobol.sh builds the Linux tree only" >&2; exit 1; }

OUT="${1:?usage: build-gnucobol.sh <output-dir>}"
VERSION=3.2
SHA256=3bb48af46ced4779facf41fdc2ee60e4ccb86eaa99d010b36685315df39c2ee2
URL="https://downloads.sourceforge.net/project/gnucobol/gnucobol/${VERSION}/gnucobol-${VERSION}.tar.xz"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TARBALL="$OUT/gnucobol-${VERSION}.tar.xz"

if [ ! -f "$TARBALL" ]; then
  curl -fsSL -o "$TARBALL" "$URL"
fi
if command -v sha256sum >/dev/null; then
  ACTUAL="$(sha256sum "$TARBALL" | cut -d' ' -f1)"
else
  ACTUAL="$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)"
fi
[ "$ACTUAL" = "$SHA256" ] || { echo "gnucobol-${VERSION}.tar.xz: sha256 $ACTUAL, expected $SHA256" >&2; exit 1; }

tar -xf "$TARBALL" -C "$WORK"
SRC="$WORK/gnucobol-${VERSION}"
# The prefix is a placeholder: nothing reads it once the tree is moved,
# because mockymock overrides every path it names (see above).
PREFIX=/opt/mockymock-gnucobol

# Indexed files are Berkeley DB, as in Debian's gnucobol package the Docker
# image uses, so an ORGANIZATION INDEXED program behaves the same in both.
# Screen I/O (curses), XML and JSON are left out: nothing mockymock runs
# drives a terminal, and leaving them out keeps the tree's own library
# dependencies to GMP and Berkeley DB.
(
  cd "$SRC"
  ./configure --prefix="$PREFIX" --with-db --with-curses=no --without-xml2 \
    --without-json --disable-nls >"$WORK/configure.log" 2>&1 \
    || { tail -50 "$WORK/configure.log" >&2; exit 1; }
  make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)" >"$WORK/make.log" 2>&1 \
    || { tail -50 "$WORK/make.log" >&2; exit 1; }
  make install DESTDIR="$WORK/stage" >"$WORK/install.log" 2>&1 \
    || { tail -50 "$WORK/install.log" >&2; exit 1; }
)

TREE="$OUT/gnucobol"
rm -rf "$TREE"
cp -R "$WORK/stage$PREFIX" "$TREE"
rm -rf "$TREE/share/man" "$TREE/share/info" "$TREE/lib/libcob.a" "$TREE/lib/libcob.la" \
  "$TREE/bin/cob-config"

# The libraries libcob links (GMP, Berkeley DB) ship inside the tree, next to
# libcob, so a machine with neither installed still runs tests. The generated
# C also #includes gmp.h, so it ships too.
# A vsix is a zip, which stores each symlink as a full copy: keep just the
# two names anything opens (libcob.so for -lcob, libcob.so.4 its soname).
(
  cd "$TREE/lib"
  real="$(readlink -f libcob.so)"
  rm libcob.so libcob.so.4
  cp "$real" libcob.so.4
  cp "$real" libcob.so
  rm -f "$real"
)
for lib in $(ldd "$TREE/lib/libcob.so" | awk '/libgmp|libdb/ {print $3}'); do
  cp -L "$lib" "$TREE/lib/"
done
GMP_H="$(echo '#include <gmp.h>' | ${CC:-cc} ${CPPFLAGS:-} -E -M - 2>/dev/null | tr ' \\' '\n\n' | grep '/gmp\.h$' | head -1)"
[ -n "$GMP_H" ] || { echo "gmp.h not found: install the GMP development files" >&2; exit 1; }
cp "$GMP_H" "$TREE/include/"

mkdir -p "$TREE/licenses"
cp "$SRC/COPYING" "$TREE/licenses/GnuCOBOL-COPYING"
cp "$SRC/COPYING.LESSER" "$TREE/licenses/GnuCOBOL-COPYING.LESSER"
for doc in /usr/share/doc/libgmp10*/copyright /usr/share/doc/libdb5.3*/copyright; do
  [ -f "$doc" ] && cp "$doc" "$TREE/licenses/$(basename "$(dirname "$doc")")-copyright"
done
cat >"$TREE/README.txt" <<EOF
GnuCOBOL ${VERSION}, bundled with the mockymock VS Code extension so tests run
without Docker. cobc is GPL-3.0-or-later; libcob is LGPL-3.0-or-later; GMP is
LGPL-3.0-or-later / GPL-2.0-or-later; Berkeley DB 5.3 is under the Sleepycat
license. Their texts are in licenses/.

Corresponding source: gnucobol-${VERSION}.tar.xz, attached to the same GitHub
release as this extension (https://github.com/Landparty/mocky-mock-vscode/releases),
and upstream at ${URL}
GMP and Berkeley DB are unmodified Debian packages (libgmp10, libdb5.3);
their source is at https://sources.debian.org/src/gmp/ and
https://sources.debian.org/src/db5.3/ (or: apt-get source gmp db5.3).
EOF

# A smoke test from the tree's new location, with the same environment
# mockymock sets: compile, run, and read coverage back.
SMOKE="$WORK/smoke"
mkdir -p "$SMOKE"
cat >"$SMOKE/SMOKE.cbl" <<'EOF'
IDENTIFICATION DIVISION.
PROGRAM-ID. SMOKE.
DATA DIVISION.
WORKING-STORAGE SECTION.
01 WS-A PIC S9(5)V99 COMP-3 VALUE 12.5.
PROCEDURE DIVISION.
    COMPUTE WS-A = WS-A * 7 / 3.
    DISPLAY "SMOKE " WS-A.
    EJECT
    STOP RUN.
EOF
(
  cd "$SMOKE"
  export COB_CONFIG_DIR="$TREE/share/gnucobol/config" COB_COPY_DIR="$TREE/share/gnucobol/copy"
  export COB_CFLAGS="-pipe -I$TREE/include -Wno-unused -fsigned-char -Wno-pointer-sign"
  export COB_LDFLAGS="-L$TREE/lib" COB_LIBS="-L$TREE/lib -lcob"
  export LD_LIBRARY_PATH="$TREE/lib"
  "$TREE/bin/cobc" -free -std=mvs --coverage -x SMOKE.cbl -o SMOKE
  [ "$(./SMOKE)" = "SMOKE +0002916" ] || { echo "smoke test printed the wrong value" >&2; exit 1; }
)
du -sh "$TREE"
