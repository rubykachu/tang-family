// Fast checks with no browser: data integrity, layout geometry and the lunar calendar.
// Run after editing data/gia-pha.json or src/: `npm run check` (exit code 1 on any failure).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const GP = require(join(ROOT, 'src/core.js'));
const lunar = require(join(ROOT, 'src/lunar.js'));
const data = JSON.parse(readFileSync(process.argv[2] || join(ROOT, 'data/gia-pha.json'), 'utf8'));

let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

/* ---------- data ---------- */
const ids = new Set(), byId = {};
let dupes = 0;
data.people.forEach((p) => { if (ids.has(p.id)) dupes++; ids.add(p.id); byId[p.id] = p; });
check(dupes === 0, 'person ids are unique');
const roots = data.people.filter((p) => !p.parent);
check(roots.length === 1, 'exactly one root ancestor (' + roots.map((p) => p.name).join(', ') + ')');
check(data.people.every((p) => !p.parent || byId[p.parent]), 'every parent id exists');
check(data.people.every((p) => {
  const seen = new Set(); let q = p;
  while (q && q.parent) { if (seen.has(q.id)) return false; seen.add(q.id); q = byId[q.parent]; }
  return true;
}), 'no cycles in parent links');
check(data.people.every((p) => p.name && p.name.trim() && ['m', 'f', 'u'].includes(p.gender)), 'every person has a name and gender m/f/u');
const dateOk = (d) => d === undefined || /^\d{1,2}\/\d{1,2}$/.test(d);
check(data.people.every((p) => dateOk(p.death) && (p.spouses || []).every((s) => dateOk(s.death))), 'death dates are d/m');
check(data.people.every((p) => !p.mother || (byId[p.parent].spouses || []).length >= p.mother), 'mother index points at an existing wife');
const sibOrders = {};
data.people.forEach((p) => { if (p.parent && p.order != null) (sibOrders[p.parent] = sibOrders[p.parent] || []).push(p.order); });
const dupOrders = Object.entries(sibOrders).filter(([, o]) => new Set(o).size !== o.length).map(([pid]) => byId[pid].name);
check(dupOrders.length === 0, 'no repeated birth-order number among siblings' + (dupOrders.length ? ' (' + dupOrders.join(', ') + ')' : ''));

/* ---------- layout ---------- */
const ix = GP.index(data);
for (const mode of ['lr', 'td']) {
  const L = GP.layout(ix, mode), list = Object.keys(L.pos);
  let overlaps = 0, crossings = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = L.pos[list[i]], B = L.pos[list[j]];
    if (A.x < B.x + B.w + 2 && B.x < A.x + A.w + 2 && A.y < B.y + B.h + 2 && B.y < A.y + A.h + 2) overlaps++;
  }
  for (const c of data.people) {
    if (!c.parent) continue;
    const segs = []; let x = 0, y = 0;
    for (const t of GP.edgePath(L, L.pos[c.parent], L.pos[c.id], ix.gen[c.id]).match(/[MHV][^MHV]*/g)) {
      const v = t.slice(1).trim().split(/\s+/).map(Number);
      if (t[0] === 'M') [x, y] = v; else if (t[0] === 'H') { segs.push([x, y, v[0], y]); x = v[0]; } else { segs.push([x, y, x, v[0]]); y = v[0]; }
    }
    for (const id of list) {
      if (id === c.id || id === c.parent) continue;
      const B = L.pos[id];
      if (segs.some(([x1, y1, x2, y2]) => Math.min(x1, x2) < B.x + B.w - 1 && Math.max(x1, x2) > B.x + 1 && Math.min(y1, y2) < B.y + B.h - 1 && Math.max(y1, y2) > B.y + 1)) crossings++;
    }
  }
  check(overlaps === 0, `${mode}: no overlapping cards (${Math.round(L.width)}x${Math.round(L.height)})`);
  check(crossings === 0, `${mode}: no connector passes through another card`);
}

/* ---------- lunar calendar against known Tết / Trung thu dates ---------- */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
[[1, 1, 2024, '2024-02-10'], [1, 1, 2025, '2025-01-29'], [1, 1, 2026, '2026-02-17'], [15, 8, 2025, '2025-10-06'], [1, 1, 2027, '2027-02-06']]
  .forEach(([d, m, y, want]) => check(iso(lunar.toSolar(d, m, y)) === want, `lunar ${d}/${m}/${y} -> ${want}`));
const back = lunar.toLunar(6, 10, 2025);
check(back.day === 15 && back.month === 8 && back.year === 2025, 'solar 6/10/2025 -> lunar 15/8/2025');

const today = lunar.upcoming([{ death: '15/9' }, { death: '16/9' }], new Date(2026, 9, 24, 15), 30);
check(today[0].inDays === 0 && today[1].inDays === 1, 'anniversary on today counts 0 days, tomorrow 1 day');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
