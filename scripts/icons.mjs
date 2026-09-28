// Иконки PWA из того же глифа, что иконка нативной Искры по умолчанию
// (assets/iskra-spark.svg — копия icons/iskra-spark.icon/Assets/Subtract2.svg из zhuravlevb/iskra, ветка dev).
//
// Нативная иконка — жёлтая искра (#FCF91E) на оливковом фоне с автоматическим градиентом
// от srgb(0.5615, 0.5997, 0.2007) ≈ #8F9933.
// Здесь то же самое, двумя формами:
//   - обычная (десктоп): скруглённый квадрат, глиф по центру;
//   - maskable (Android): заливка на весь холст, глиф внутри безопасного круга (80%).
//
// Запуск: pnpm icons. Результат коммитится в public/icons.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const glyphSvg = await readFile(new URL('../assets/iskra-spark.svg', import.meta.url), 'utf8');
const glyphPath = glyphSvg.match(/<path d="([^"]+)"/)[1];
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const SPARK = '#FCF91E';
const OLIVE_TOP = '#A7B04F';
const OLIVE = '#8F9933';
const OLIVE_BOTTOM = '#7C8629';
const [, W, H] = glyphSvg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);

/** SVG иконки на холсте 1024: `glyph` — доля холста под глиф, `radius` — скругление. */
function iconSvg({ glyph, radius }) {
  const size = 1024;
  const g = size * glyph;
  const scale = g / Math.max(W, H);
  const dx = (size - W * scale) / 2;
  const dy = (size - H * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${OLIVE_TOP}"/>
      <stop offset="0.5" stop-color="${OLIVE}"/>
      <stop offset="1" stop-color="${OLIVE_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="url(#bg)"/>
  <path transform="translate(${dx} ${dy}) scale(${scale})" d="${glyphPath}" fill="${SPARK}"/>
</svg>`;
}

const regular = iconSvg({ glyph: 0.76, radius: 0.225 });
const maskable = iconSvg({ glyph: 0.6, radius: 0 });

const targets = [
  ['icon-192.png', regular, 192],
  ['icon-512.png', regular, 512],
  ['maskable-512.png', maskable, 512],
  ['apple-touch-icon-180.png', maskable, 180],
];
for (const [name, svg, size] of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(name, out).pathname);
}
await writeFile(new URL('icon.svg', out), regular);

// Фавиконка «есть непрочитанное»: та же иконка с точкой в углу. Точка — синяя, как акцент
// по умолчанию, с белой обводкой: красная в заголовке вкладки читалась бы как ошибка.
const dot = `<circle cx="820" cy="204" r="190" fill="#007AFF" stroke="#FFFFFF" stroke-width="56"/>`;
await writeFile(new URL('icon-unread.svg', out), regular.replace('</svg>', `  ${dot}\n</svg>`));
console.log('icons written to public/icons');
