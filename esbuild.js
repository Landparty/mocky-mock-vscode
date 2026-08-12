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
  // Runs inside the webview's isolated browser context -- a separate
  // bundle from out/extension.js (platform: 'browser', no 'vscode'
  // external, since the webview never imports it).
  const webviewCtx = await esbuild.context({
    entryPoints: ['media/paragraphTree/main.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'out/media/paragraphTree/main.js',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
  });
  const programFlowWebviewCtx = await esbuild.context({
    entryPoints: ['media/programFlow/main.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'out/media/programFlow/main.js',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
  });
  const fs = require('fs');
  fs.mkdirSync('out/media/paragraphTree', { recursive: true });
  fs.copyFileSync('media/paragraphTree/styles.css', 'out/media/paragraphTree/styles.css');
  fs.mkdirSync('out/media/programFlow', { recursive: true });
  fs.copyFileSync('media/programFlow/styles.css', 'out/media/programFlow/styles.css');
  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch(), programFlowWebviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild(), programFlowWebviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose(), programFlowWebviewCtx.dispose()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
