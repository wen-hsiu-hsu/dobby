// 產生報名／請假 Flex 卡片用的圖示 PNG（輸出到 assets/flex/，由 GitHub Pages 發布）。
//
// LINE Flex 的圖片只收 PNG／JPEG，所以把 Lucide 的 SVG 換色、換線寬後轉成 PNG。
// 一次性工具：圖示有變動時才需要重跑，產出的 PNG 直接 commit。
// 轉檔用的 @resvg/resvg-js 裝在暫存資料夾，不列進 package.json。
//
// 用法：node scripts/generate-flex-icons.mjs
//
// 注意：已上線的卡片會一直讀同一個網址，改圖示要換檔名，不要覆蓋舊檔（見 docs/adr/0010）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LUCIDE_VERSION = '0.544.0';
const RESVG_VERSION = '2.6.2';
const SIZE = 96; // 卡片上顯示 16px，輸出 96px 讓高解析度螢幕也清楚

const ICONS = [
  { file: 'check-dark.png', icon: 'check', color: '#111111', strokeWidth: 2.5 },
  { file: 'calendar-check-dark.png', icon: 'calendar-check', color: '#111111', strokeWidth: 2.5 },
  { file: 'calendar-x-dark.png', icon: 'calendar-x', color: '#111111', strokeWidth: 2.5 },
  { file: 'ban-dark.png', icon: 'ban', color: '#111111', strokeWidth: 2.5 },
  { file: 'minus-white.png', icon: 'minus', color: '#FFFFFF', strokeWidth: 2.5 },
  { file: 'info-white.png', icon: 'info', color: '#FFFFFF', strokeWidth: 2.5 },
  { file: 'users-gray.png', icon: 'users', color: '#A3A3A3', strokeWidth: 2 },
  { file: 'calendar-x-gray.png', icon: 'calendar-x', color: '#A3A3A3', strokeWidth: 2 },
  { file: 'user-check-gray.png', icon: 'user-check', color: '#A3A3A3', strokeWidth: 2 },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'flex');
mkdirSync(outDir, { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), 'flex-icons-'));
try {
  execFileSync('npm', ['install', '--no-save', '--silent', '--prefix', tmp, `@resvg/resvg-js@${RESVG_VERSION}`], {
    stdio: 'inherit',
  });
  const { Resvg } = await import(pathToFileURL(join(tmp, 'node_modules', '@resvg', 'resvg-js', 'index.js')).href);

  for (const { file, icon, color, strokeWidth } of ICONS) {
    const res = await fetch(`https://unpkg.com/lucide-static@${LUCIDE_VERSION}/icons/${icon}.svg`);
    if (!res.ok) throw new Error(`Failed to fetch ${icon}.svg: ${res.status}`);
    const svg = (await res.text())
      .replace('stroke="currentColor"', `stroke="${color}"`)
      .replace(/stroke-width="[\d.]+"/, `stroke-width="${strokeWidth}"`);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
    writeFileSync(join(outDir, file), png);
    console.log(`wrote assets/flex/${file}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
