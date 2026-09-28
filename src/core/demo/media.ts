/**
 * Медиа демо-сервера: картинки рисуются здесь же (SVG — текст, его можно сочинить без
 * файлов), загруженное — живёт в памяти, пока открыта вкладка.
 */
import { DEMO_SERVER } from './fixtures';

export interface DemoMedia {
  bytes: Uint8Array;
  type: string;
}

const encode = (text: string) => new TextEncoder().encode(text);

function lake(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2e5"/><stop offset="1" stop-color="#f3d9b1"/></linearGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f86b8"/><stop offset="1" stop-color="#1f3f66"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#sky)"/><circle cx="880" cy="250" r="70" fill="#fff4c4"/>
<path d="M0 470 L180 330 L330 440 L520 290 L720 450 L900 340 L1200 480 L1200 520 L0 520Z" fill="#3f6b4a"/>
<rect y="500" width="1200" height="300" fill="url(#water)"/>
<path d="M120 610h260M500 660h320M760 590h220" stroke="#b9d3ec" stroke-width="6" stroke-linecap="round" opacity=".6"/></svg>`;
}

function forest(): string {
  const trees = Array.from({ length: 9 }, (_, i) => {
    const x = 60 + i * 90;
    const h = 380 + ((i * 53) % 180);
    return `<path d="M${x} ${1000 - h} L${x + 70} 1000 L${x - 70} 1000Z" fill="${i % 2 ? '#2e5a3a' : '#23482e'}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<rect width="800" height="1000" fill="#cfe3d0"/><circle cx="600" cy="180" r="90" fill="#fdf1c7"/>${trees}</svg>`;
}

/** mediaId → байты. */
export function demoMediaLibrary(): Map<string, DemoMedia> {
  return new Map([
    ['lake', { bytes: encode(lake()), type: 'image/svg+xml' }],
    ['forest', { bytes: encode(forest()), type: 'image/svg+xml' }],
    ['list', { bytes: encode('Что взять на пикник\n\n— плед\n— термос\n— мангал и угли\n— пирог (Вера)\n'), type: 'text/plain' }],
  ]);
}

export const demoMxc = (id: string) => `mxc://${DEMO_SERVER}/${id}`;
