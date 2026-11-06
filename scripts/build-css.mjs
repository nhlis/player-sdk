// TypeScript 6+ checks side-effect imports by default: without a `types` condition on the "./style.css" export,
// every consumer would get TS2882 on that line. Bundlers and Node ignore the `types` condition and load the CSS.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('src/player.css', 'dist/style.css');
writeFileSync('dist/style.d.ts', 'export {};\n');
