// Exports the print poster as a vector PDF on A-series paper: cây ngang ("lr", portrait page, default)
// or cây dọc ("td", landscape page). Needs Playwright: `npm install` once, then `npm run pdf`
// (or: node tools/pdf.mjs A0 lr | node tools/pdf.mjs A1 td).
// Families without Node can instead open the app and use "Chú thích → In / lưu PDF".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const GP = require(join(ROOT, 'src/core.js'));
const PAPER = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420] };
const size = (process.argv[2] || 'A1').toUpperCase();
if (!PAPER[size]) throw new Error('Paper must be one of ' + Object.keys(PAPER).join(', '));
const mode = process.argv[3] === 'td' ? 'td' : 'lr';
const [pw, ph] = mode === 'td' ? [PAPER[size][1], PAPER[size][0]] : PAPER[size];

const data = JSON.parse(readFileSync(join(ROOT, 'data/gia-pha.json'), 'utf8'));
const st = GP.renderStatic(data, mode);
const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8');
const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><style>${css}
@page { size: ${pw}mm ${ph}mm; margin: 0; }
html, body { margin: 0; background: #f6efe2; }
svg { display: block; width: ${pw}mm; height: ${ph}mm; }
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" id="gp-root" viewBox="0 0 ${st.width} ${st.height}" preserveAspectRatio="xMidYMid meet">${st.svg}</svg></body></html>`;

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.addScriptTag({ path: join(ROOT, 'src/core.js') });
await page.evaluate(() => GP.fitTexts(document.body));
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, `dist/gia-pha-${size}${mode === 'td' ? '-ngang' : ''}.pdf`);
writeFileSync(out, await page.pdf({ width: `${pw}mm`, height: `${ph}mm`, printBackground: true, pageRanges: '1' }));
await browser.close();
console.log(out);
