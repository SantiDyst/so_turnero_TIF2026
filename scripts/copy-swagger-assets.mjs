import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('swagger-ui-dist/package.json'));
const target = join(process.cwd(), 'public', 'docs');

const files = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-16x16.png',
  'favicon-32x32.png',
];

mkdirSync(target, { recursive: true });

for (const file of files) {
  copyFileSync(join(source, file), join(target, file));
}

console.log(`Copied ${files.length} Swagger UI assets to public/docs.`);
