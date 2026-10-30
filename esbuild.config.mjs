import esbuild from 'esbuild';
import {readFileSync} from 'node:fs';
const options = {
  entryPoints: ['src/main.ts'], bundle: true, outfile: 'main.js', format: 'cjs',
  target: 'es2018', platform: 'browser', external: ['obsidian'],
  banner: { js: '/* Nebula Focus | GPL-3.0-only | Source: src/ */\n/*!\n'+readFileSync('THIRD-PARTY-NOTICES.md','utf8').replaceAll('*/','* /')+'\n*/' },
  logLevel: 'info', minify: false,
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else await esbuild.build(options);
