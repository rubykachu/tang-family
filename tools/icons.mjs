// Renders the raster brand assets into assets/ (run once, or after changing the logo or title):
//   icon-180.png  home-screen icon (iOS/Android "Add to Home Screen")
//   icon-512.png  large icon
//   og-image.png  1200x630 preview shown when the link is shared on Zalo/Facebook/Messenger
// Rasterizing in a browser keeps the Hán character 曾 identical on every device that later shows the PNGs.
// Needs Playwright: `npm install` then `npm run icons`.
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const GP = require(join(ROOT, 'src/core.js'));
const data = JSON.parse(readFileSync(join(ROOT, 'data/gia-pha.json'), 'utf8'));
const st = GP.stats(GP.index(data));
const logo = GP.logoSvg();
const font = '<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500&family=Noto+Serif:wght@800&family=Noto+Serif+SC:wght@700&display=swap" rel="stylesheet">';

const og = `<!DOCTYPE html><html><head><meta charset="utf-8">${font}<style>
html,body{margin:0}
.c{width:1200px;height:630px;box-sizing:border-box;background:#f6efe2;display:flex;align-items:center;gap:56px;padding:0 84px;
  border:14px solid #f6efe2;outline:3px solid #c9a24a;outline-offset:-26px;font-family:'Be Vietnam Pro',sans-serif}
.c svg{width:250px;height:250px;flex:none;filter:drop-shadow(0 12px 24px rgba(120,30,20,.25))}
h1{font-family:'Noto Serif',serif;font-weight:800;font-size:92px;line-height:1.05;color:#a8231f;margin:0;letter-spacing:2px}
h2{font-family:'Noto Serif',serif;font-weight:800;font-size:34px;color:#6b4e1d;margin:18px 0 26px}
p{font-size:28px;color:#7a6a58;margin:0}
</style></head><body><div class="c">${logo}<div><h1>${GP.esc(data.meta.title)}</h1><h2>${GP.esc(data.meta.subtitle)}</h2>
<p>${st.people} người · ${st.gens} đời · ${st.phai} phái</p></div></div></body></html>`;

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage();
mkdirSync(join(ROOT, 'assets'), { recursive: true });
for (const size of [180, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><head>${font}<style>html,body{margin:0;background:#a8231f}svg{display:block;width:${size}px;height:${size}px}
  text{font-family:'Noto Serif SC',serif!important}</style></head><body>${logo.replace('rx="11"', 'rx="0"')}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, `assets/icon-${size}.png`) });
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'svg text{font-family:"Noto Serif SC",serif!important}' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, 'assets/og-image.png') });
await browser.close();
console.log('assets/icon-180.png, assets/icon-512.png, assets/og-image.png');
