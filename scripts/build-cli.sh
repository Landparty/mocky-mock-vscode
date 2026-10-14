#!/usr/bin/env bash
# Builds the single-file mockymock executable the platform vsix files bundle,
# from whatever mocky-mock + cobol-parser are installed in the active Python
# (build-and-release.yml installs both from PyPI first, plus nuitka).
#
# Usage: scripts/build-cli.sh <output-filename>
# Writes cli-build/<output-filename> and cli-build/LICENSE (mocky-mock's own
# license, copied out of the installed distribution).
#
# Mirrors mocky-mock's scripts/build_executable.sh, with one difference: that
# script runs from a repo checkout and names each data file by its source
# path, while this one only has the installed package, so it takes the
# package's data files (the GnuCOBOL Dockerfile, the dashboard's static
# assets) with --include-package-data instead.
set -euo pipefail

OUTPUT_NAME="${1:?usage: build-cli.sh <output-filename>}"
OUT_DIR=cli-build
mkdir -p "$OUT_DIR"

MOCKYMOCK_VERSION="$(python -c 'from mockymock import __version__; print(__version__)')"

# --onefile-tempdir-spec: a stable, version-scoped unpack directory, so the
# onefile bootstrap skips re-extracting the payload on every launch (see
# build_executable.sh in mocky-mock for the full story).
python -m nuitka \
  --onefile \
  --onefile-tempdir-spec="{CACHE_DIR}/mockymock/{VERSION}" \
  --product-version="$MOCKYMOCK_VERSION" \
  --output-dir="$OUT_DIR" \
  --output-filename="$OUTPUT_NAME" \
  --assume-yes-for-downloads \
  --lto=no \
  --include-package=mockymock \
  --include-package-data=mockymock \
  packaging/nuitka_entry.py

python - "$OUT_DIR/LICENSE" <<'PY'
import importlib.metadata as m
import shutil
import sys

dist = m.distribution("mocky-mock")
licenses = [f for f in dist.files or [] if f.name.startswith("LICENSE")]
if not licenses:
    sys.exit("mocky-mock's installed distribution ships no LICENSE file")
shutil.copyfile(licenses[0].locate(), sys.argv[1])
PY
