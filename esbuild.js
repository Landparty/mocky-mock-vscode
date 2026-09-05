// Bundles src/extension.ts (and everything it imports, including
// fast-xml-parser) into a single out/extension.js. Production builds are
// minified with no sourcemap, so the packaged .vsix doesn't ship anything
// close to readable source -- see PUBLISHING.md. Dev builds keep a
// sourcemap for the "Run Extension" launch config's breakpoint mapping
// (.vscode/launch.json's outFiles).
//
// There are no webview bundles here any more: the Paragraph Tree and
// Program Flow views (and their media/ clients) moved to the cobol-analyzer
// extension, which builds them with its own copy of this script.
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
  });
  if (watch) {
    await extensionCtx.watch();
  } else {
    await extensionCtx.rebuild();
    await extensionCtx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
