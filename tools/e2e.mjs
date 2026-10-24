// Browser test of the built files: search, select, anniversaries, edit, undo, save, reopen the saved copy.
// Run `npm run build` first, then `npm run e2e` (needs Playwright: `npm install`, `npx playwright install chromium`).
import { chromium } from 'playwright';
import { readFileSync as rf, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fs = { readFileSync: rf };
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok   ' + m); };

for (const file of [join(ROOT, 'dist/gia-pha.svg'), join(ROOT, 'dist/index.html')]) {
  const ext = file.endsWith('.svg') ? '.svg' : '.html';
  console.log('--- ' + file.slice(ROOT.length + 1));

      const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
      await page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const n0 = await page.evaluate(() => GPApp.state.data.people.length);
      const nData = JSON.parse(rf(join(ROOT, 'data/gia-pha.json'), 'utf8')).people.length;
  assert(n0 === nData, 'loads all ' + nData + ' people');
      assert(await page.evaluate(() => document.querySelectorAll('#gp-tree .card').length) === nData, 'renders one card per person');
      const overflow = await page.evaluate(() => [...document.querySelectorAll('#gp-tree text[data-fit]')]
    .filter((t) => t.getBBox().width > +t.dataset.fit + 1).map((t) => t.textContent));
  assert(overflow.length === 0, 'no card text overflows its card' + (overflow.length ? ': ' + overflow.join(' | ') : ''));
  // search without diacritics
      await page.fill('input[type=search]', 'tang tuong');
      await page.waitForTimeout(200);
      const hits = await page.$$eval('.results button', b => b.map(x => x.textContent));
      assert(hits.some(t => t.includes('Tăng Tường')), 'search "tang tuong" finds Tăng Tường');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(900);
      const panelName = await page.textContent('.panel .pn-main');
      assert(panelName === 'Tường', 'panel shows the picked person');
      assert(await page.evaluate(() => document.querySelectorAll('.edge.lit').length) > 10, 'lineage edges highlighted');
      // testament page opens and its close button really receives the click
  await page.click('button[title="Lời dặn của tộc"]');
  await page.click('.tm-close button', { timeout: 3000 });
  assert(!(await page.$('.testament')), 'testament page closes with its × button');
  // anniversaries
      await page.click('button[title="Ngày giỗ sắp tới"]');
      await page.waitForTimeout(300);
      const ann = await page.$$eval('.list-item', l => l.length);
      assert(ann > 40, 'anniversary list has ' + ann + ' entries');
      await page.keyboard.press('Escape');
      // edit: add a child under the last person of the data
      await page.click('button[title="Bật/tắt chế độ chỉnh sửa"]');
      const leaf = await page.evaluate(() => { const p = GPApp.state.data.people.find(x => x.name === 'Tăng Thị Bảo Linh'); GPApp.select(p.id, true); return p.id; });
      await page.waitForTimeout(700);
      await page.click('.panel button[title="Thêm con"]');
      // type like a user (works in both HTML and XML documents)
      const typeInto = async (label, text) => {
        await page.locator('.modal .field').filter({ hasText: label }).first().locator('input').click();
        await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(text);
      };
      await typeInto('Họ và tên', 'Tăng Thử Nghiệm');
      await typeInto('Ngày giỗ', '99/99');
      await page.click('.modal button[title="Thêm người"]');
      assert(await page.$('.modal') !== null, 'invalid death date blocks saving');
      await typeInto('Ngày giỗ', ' 3 / 4 ');
      await page.click('.modal button[title="Thêm người"]');
      await page.waitForTimeout(500);
      const added = await page.evaluate(() => GPApp.state.data.people.find(p => p.name === 'Tăng Thử Nghiệm'));
      assert(added && added.parent === leaf && added.death === '3/4' && added.order === 1, 'child added with parent, cleaned date 3/4, order 1');
      assert(await page.evaluate((pid) => GPApp.state.ix.gen[GPApp.state.data.people.find(p => p.name === 'Tăng Thử Nghiệm').id] === GPApp.state.ix.gen[pid] + 1, leaf), 'new child is one generation below the parent');
      // undo then redo-by-hand
      await page.click('.editbar button[title="Hoàn tác"]');
      assert(await page.evaluate(() => GPApp.state.data.people.length) === nData, 'undo removes the new child');
      await page.evaluate((id) => GPApp.select(id, true), leaf);
      await page.waitForTimeout(500);
      await page.click('.panel button[title="Thêm con"]');
      await typeInto('Họ và tên', 'Tăng Thử Nghiệm');
      await page.click('.modal button[title="Thêm người"]');
      await page.waitForTimeout(400);
      // save file
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.editbar button[title="Tải về file gia phả đã cập nhật"]')]);
      const out = join(mkdtempSync(join(tmpdir(), 'gia-pha-')), 'saved' + ext);
      await dl.saveAs(out);
      assert(dl.suggestedFilename().endsWith(ext), 'download named ' + dl.suggestedFilename());
      // reopen the saved file
      const p2 = await ctx.newPage();
      p2.on('pageerror', e => errors.push('saved: ' + e.message));
      await p2.goto('file://' + out, { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(1200);
      const n2 = await p2.evaluate(() => GPApp.state.data.people.length);
      assert(n2 === nData + 1, 'saved file reopens with the added person');
      assert(await p2.evaluate(() => !!GPApp.state.data.meta.updated), 'saved file records update date');
      assert(await p2.evaluate(() => document.querySelectorAll('#gp-tree .card').length) === nData + 1, 'saved file renders the added card');
      const src = fs.readFileSync(out, 'utf8');
      assert((src.match(/id="c-p001"/g) || []).length === 1, 'saved file keeps one static picture (no duplicated live layer)');
      const markup = src.replace(/<script[\s\S]*?<\/script>/g, '');
      assert(!/id="gp-(ui|ui-root|live)"/.test(markup), 'saved file has no UI leftovers');
      assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
      await browser.close();
}
