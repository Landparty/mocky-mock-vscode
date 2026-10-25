GnuCOBOL 3.2 for Windows, bundled with the mockymock VS Code extension so
tests run without Docker.

It is Arnold Trembley's MinGW build GC32-BDB, the build the Chocolatey
package `gnucobol` 3.2.0.20240515 installs, redistributed unmodified:
  https://arnoldtrembley.com/GC32-BDB-rename-7z-to-exe.7z
  sha256 095c6c0f5b4bfa6d2609ae90d26e184510cb5a24b7644a4fb62ab7a6f9e7b2dc
Its own banner (set_env.cmd): GnuCOBOL 3.2.0 (Jul 28 2023), MinGW gcc 9.2.0,
GMP 6.2.1, cJSON 1.7.14, PDCursesMod 4.3.7, BDB 18.1.40.

Components, their licenses (texts in this folder; GPL-3.0 and LGPL-3.0 are
GnuCOBOL-COPYING and GnuCOBOL-COPYING.LESSER), and corresponding source:

  Component                     Version   License                           Source
  ----------------------------  --------  --------------------------------  -----------------------------------------------
  GnuCOBOL cobc                 3.2       GPL-3.0-or-later                  gnucobol-3.2.tar.xz on the extension's GitHub
  GnuCOBOL libcob               3.2       LGPL-3.0-or-later                   release, and https://sourceforge.net/projects/gnucobol/files/gnucobol/3.2/
  GMP (libgmp-10.dll)           6.2.1     LGPL-3.0-or-later / GPL-2.0-or-later  https://gmplib.org/download/gmp/gmp-6.2.1.tar.xz
  Berkeley DB (libdb-18.1.dll)  18.1.40   AGPL-3.0                          https://www.oracle.com/database/technologies/related/berkeleydb-downloads.html
  cJSON (in libcob)             1.7.14    MIT (cJSON-MIT.txt)               https://github.com/DaveGamble/cJSON/releases/tag/v1.7.14
  PDCursesMod (pdcurses*.dll)   4.3.7     Public domain                     https://github.com/Bill-Gray/PDCursesMod/releases/tag/v4.3.7
  GCC (gcc, cc1, gcov, ...)     9.2.0     GPL-3.0-or-later                  https://ftp.gnu.org/gnu/gcc/gcc-9.2.0/ (MinGW.org build: https://osdn.net/projects/mingw/)
  GCC runtime libraries         9.2.0     GPL-3.0-or-later with the GCC     as above
   (libgcc_s_dw2-1, libstdc++,             Runtime Library Exception
   libgomp, libssp, libatomic,             (GCC-RUNTIME-LIBRARY-EXCEPTION.txt)
   libquadmath)
  GNU Binutils (as, ld, ...)    2.32      GPL-3.0-or-later                  https://ftp.gnu.org/gnu/binutils/binutils-2.32.tar.xz
  GNU gdb                       7.6.1     GPL-3.0-or-later                  https://ftp.gnu.org/gnu/gdb/gdb-7.6.1.tar.bz2
  MPFR, MPC (gcc internals)     -         LGPL-3.0-or-later                 https://www.mpfr.org/ , https://www.multiprecision.org/mpc/
  ISL (gcc internals)           -         MIT (MIT.txt)                     https://libisl.sourceforge.io/
  MinGW.org runtime, w32api     5.4.2     MIT-style / public domain         https://osdn.net/projects/mingw/
   (mingwm10.dll)                          (MIT.txt)
  gettext (libintl, libgettext) 0.18.3    LGPL-2.1-or-later (LGPL-2.1.txt)  https://ftp.gnu.org/gnu/gettext/gettext-0.18.3.tar.gz
  libiconv (libiconv-2.dll)     -         LGPL-2.1-or-later (LGPL-2.1.txt)  https://ftp.gnu.org/gnu/libiconv/
  expat (libexpat-1.dll)        -         MIT (MIT.txt)                     https://libexpat.github.io/
  zlib (zlib1.dll)              -         Zlib (Zlib.txt)                   https://zlib.net/
  bzip2 (libbz2-2.dll)          -         bzip2-1.0.6 (bzip2-1.0.6.txt)     https://sourceware.org/bzip2/

A dash means the build does not state the exact version. MinGW.org binaries
are built from those upstream releases; their packaging sources are kept by
the MinGW.org project at the link above.
