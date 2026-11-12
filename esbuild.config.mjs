import esbuild from 'esbuild';
import {readFileSync} from 'node:fs';
const options = {
  entryPoints: ['src/main.ts'], bundle: true, outfile: 'main.js', format: 'cjs',
  target: 'es2018', platform: 'browser', external: ['obsidian', 'node:*'],
  // Community-plugin updates install only main.js, manifest.json and styles.css.
  // Embed the optional font so offline mobile installs need no extra asset download.
  loader: {'.woff2': 'dataurl'},
  banner: { js: '/* Nebula Focus code | GPL-3.0-only | Source: src/ | Bundled font: OFL-1.1 */\n/*!\n'+readFileSync('THIRD-PARTY-NOTICES.md','utf8').replaceAll('*/','* /')+'\n*/' },
  logLevel: 'info', minify: false,
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else await esbuild.build(options);
