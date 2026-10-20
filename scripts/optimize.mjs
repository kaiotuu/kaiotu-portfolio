// node scripts/optimize.mjs
// source-images/**.(png|jpg|jpeg|webp) -> dist/img/<name>-{480,960,1600}.{avif,webp}
// and dist/img/manifest.json (intrinsic sizes, used to prevent layout shift).
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, parse, relative } from 'node:path';
import sharp from 'sharp';

const SRC = 'source-images', OUT = 'dist/img', WIDTHS = [480, 960, 1600, 2400];
const walk = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true }).catch(() => [])).map((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))).flat();

const files = (await walk(SRC)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const manifest = {};
for (const f of files) {
  const rel = relative(SRC, f).split('\\').join('/');
  const p = parse(rel);
  const base = join(p.dir, p.name);
  await mkdir(join(OUT, p.dir), { recursive: true });
  const meta = await sharp(f).metadata();
  const widths = WIDTHS.filter((w) => w < meta.width);
  if (!widths.includes(Math.min(meta.width, 2400))) widths.push(Math.min(meta.width, 2400));
  manifest[rel] = { w: meta.width, h: meta.height, widths, base: base.split('\\').join('/') };
  for (const w of widths) {
    const img = sharp(f).resize({ width: w, withoutEnlargement: true });
    await img.clone().avif({ quality: 55, effort: 4 }).toFile(join(OUT, `${base}-${w}.avif`));
    await img.clone().webp({ quality: 82 }).toFile(join(OUT, `${base}-${w}.webp`));
  }
  console.log('optimized', rel, widths.join(','));
}
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`${files.length} image(s) done`);
