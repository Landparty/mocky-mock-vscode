// Bundles src/extension.ts (and everything it imports, including
// fast-xml-parser) into a single out/extension.js. Production builds are
// minified with no sourcemap, so the packaged .vsix doesn't ship anything
// close to readable source -- see PUBLISHING.md. Dev builds keep a
// sourcemap for the "Run Extension" launch config's breakpoint mapping
// (.vscode/launch.json's outFiles).
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
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
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
