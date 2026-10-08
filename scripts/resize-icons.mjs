import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const master = await readFile(new URL('../assets/icon.svg', import.meta.url));
for (const size of [192, 512]) {
  const buffer = await sharp(master).resize(size, size).png().toBuffer();
  await writeFile(new URL('../public/pwa-' + size + '.png', import.meta.url), buffer);
}
