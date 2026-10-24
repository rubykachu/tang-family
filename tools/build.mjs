// Builds the two published files from data/gia-pha.json and src/:
//   dist/gia-pha.svg  — one self-contained SVG: opens as a picture anywhere, and as the full
//                       interactive app (search, anniversaries, editing) in a web browser.
//   dist/index.html   — the same app wrapped in an HTML page, best for phones and web hosting.
//   dist/logo.svg, dist/icon-512.png, dist/og-image.png — brand assets (PNGs come from `npm run icons`).
// Usage: node tools/build.mjs [lr|td]   (orientation of the static picture, default lr = portrait poster)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);
const GP = require(join(ROOT, 'src/core.js'));
require(join(ROOT, 'src/lunar.js'));

const mode = process.argv[2] === 'td' ? 'td' : 'lr';
const data = JSON.parse(read('data/gia-pha.json'));
const css = read('src/style.css');
const code = ['src/core.js', 'src/lunar.js', 'src/app.js'].map(read).join('\n');
const st = GP.renderStatic(data, mode);
const json = JSON.stringify(data, null, 1);
const title = data.meta.title;
const st0 = GP.stats(GP.index(data));
const desc = `${data.meta.subtitle}: ${st0.people} người qua ${st0.gens} đời. Tìm tên, xem dòng dõi và ngày giỗ âm lịch đổi sang dương lịch.`;
const favicon = 'data:image/svg+xml,' + encodeURIComponent(GP.logoSvg());
const touchIcon = 'data:image/png;base64,' + readFileSync(join(ROOT, 'assets/icon-180.png')).toString('base64');

for (const [name, text] of [['code', code], ['data', json], ['css', css]]) {
  if (text.includes(']]>')) throw new Error(`${name} contains "]]>" and would break the CDATA section`);
}

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" id="gp-root" lang="vi" viewBox="0 0 ${st.width} ${st.height}" width="${st.width}" height="${st.height}">`;
const svg = `<?xml version="1.0" encoding="UTF-8"?>
${svgOpen}
<title>${GP.esc(title)}</title>
<desc>${GP.esc(desc)}</desc>
<style><![CDATA[
${css}
]]></style>
<g id="gp-static">${st.svg}</g>
<script type="application/json" id="gp-data"><![CDATA[
${json}
]]></script>
<script><![CDATA[
${code}
]]></script>
</svg>
`;

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#a8231f">
<meta name="description" content="${GP.esc(desc)}">
<meta name="robots" content="noindex, nofollow">
<meta name="application-name" content="${GP.esc(title)}">
<meta name="apple-mobile-web-app-title" content="${GP.esc(title)}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta property="og:type" content="website">
<meta property="og:locale" content="vi_VN">
<meta property="og:title" content="${GP.esc(title)}">
<meta property="og:description" content="${GP.esc(desc)}">
<meta property="og:image" content="og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${favicon}">
<link rel="apple-touch-icon" href="${touchIcon}">
<title>${GP.esc(title)}</title>
<style>
${css}
</style>
</head>
<body>
${svgOpen}<g id="gp-static">${st.svg}</g></svg>
<script type="application/json" id="gp-data">${json.replace(/<\//g, '<\\/')}</script>
<script>
${code.replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/gia-pha.svg'), svg);
writeFileSync(join(ROOT, 'dist/index.html'), html);
writeFileSync(join(ROOT, 'dist/logo.svg'), GP.logoSvg() + '\n');
for (const f of ['icon-512.png', 'og-image.png']) copyFileSync(join(ROOT, 'assets', f), join(ROOT, 'dist', f));
console.log(`dist/gia-pha.svg ${(svg.length / 1024).toFixed(0)} KB, dist/index.html ${(html.length / 1024).toFixed(0)} KB, picture ${st.width}x${st.height} (${mode})`);
