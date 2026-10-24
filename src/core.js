/* Core model, layout and SVG rendering of the family tree.
 * Plain script (no modules) so the same code runs in Node at build time and inside the
 * published SVG/HTML at run time. Everything hangs off the global `GP`. */
var GP = (typeof GP !== 'undefined' && GP) || {};

GP.THEME = {
  phai: { I: '#8e44ad', II: '#0f8b8d', III: '#c0392b', IV: '#2457a6' },
  ancestor: '#9a7b3a',
  wife: ['#2e9e44', '#e8731a', '#d4a106'], // children of 1st / 2nd / 3rd wife (same hues as the 2007 chart)
  wifeLabel: ['bà cả', 'bà hai', 'bà ba', 'bà tư', 'bà năm'],
};

GP.SIZE = {
  cardW: 200, padX: 10, nameTop: 30,
  sibGap: 24, cousinGap: 44, rowGap: 72,
  marginX: 40, marginTop: 30, marginBottom: 40, labelW: 120,
};

/* ---------- model ---------- */

GP.index = function (data) {
  var byId = {}, kids = {};
  data.people.forEach(function (p) { byId[p.id] = p; kids[p.id] = []; });
  data.people.forEach(function (p) { if (p.parent && kids[p.parent]) kids[p.parent].push(p); });
  Object.keys(kids).forEach(function (id) { kids[id] = GP.sortSiblings(kids[id]); });
  var roots = data.people.filter(function (p) { return !p.parent || !byId[p.parent]; });
  var gen = {};
  (function walk(list, g) { list.forEach(function (p) { gen[p.id] = g; walk(kids[p.id], g + 1); }); })(roots, 1);
  return { data: data, byId: byId, kids: kids, roots: roots, gen: gen };
};

/* Siblings follow their birth-order number; siblings without a number keep their place in the data. */
GP.sortSiblings = function (list) {
  var last = 0, keyed = list.map(function (p, i) {
    var k = typeof p.order === 'number' ? p.order : last + 0.5;
    if (typeof p.order === 'number') last = p.order;
    return { p: p, k: k, i: i };
  });
  keyed.sort(function (a, b) { return a.k - b.k || a.i - b.i; });
  return keyed.map(function (x) { return x.p; });
};

GP.ancestors = function (ix, id) {
  var out = [], p = ix.byId[id];
  while (p && p.parent && ix.byId[p.parent]) { p = ix.byId[p.parent]; out.push(p); }
  return out;
};

GP.descendants = function (ix, id) {
  var out = [];
  (function walk(pid) { ix.kids[pid].forEach(function (c) { out.push(c); walk(c.id); }); })(id);
  return out;
};

GP.phaiOf = function (ix, id) {
  var p = ix.byId[id];
  while (p) { if (p.phai) return p.phai; p = ix.byId[p.parent]; }
  return null;
};

GP.colorOf = function (ix, id) {
  var ph = GP.phaiOf(ix, id);
  return ph ? GP.THEME.phai[ph] : GP.THEME.ancestor;
};

/* Contact phone numbers are stored encoded (base64 of the reversed text) so they never sit in the files as
 * plain digits that crawlers or spam bots can harvest; the app decodes one only when a viewer taps to show it.
 * Encode a new number with: node -e "console.log(require('./src/core.js').hidePhone('0912 345 678'))" */
GP.hidePhone = function (s) {
  var r = String(s).split('').reverse().join('');
  return typeof btoa === 'function' ? btoa(r) : Buffer.from(r).toString('base64');
};
GP.revealPhone = function (s) {
  var r = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString();
  return r.split('').reverse().join('');
};

/* "Bản gốc …" plus one line per later maintainer; phones are never included here. */
GP.creditLines = function (meta) {
  var out = ['Bản gốc: ' + (meta.compiler || '') + ' sưu tầm và thiết kế' + (meta.compiledOn ? ' (' + meta.compiledOn + ')' : '')];
  (meta.maintainers || []).forEach(function (m) {
    out.push((m.role || 'Cập nhật') + ': ' + (GP.genderLabel(m.gender) ? GP.genderLabel(m.gender) + ' ' : '') + m.name + (m.date ? ' (' + m.date + ')' : ''));
  });
  if (meta.updated) out.push('Cập nhật lần cuối: ' + meta.updated);
  return out;
};

GP.genderLabel = function (g) { return g === 'm' ? 'Ông' : g === 'f' ? 'Bà' : ''; };

/* Splits "Tăng Văn Hay" into a small prefix "Tăng Văn" and the given name "Hay" shown large. */
GP.splitName = function (name) {
  var w = (name || '').trim().split(/\s+/);
  if (w.length >= 2 && /^vô$/i.test(w[w.length - 2]) && /^danh$/i.test(w[w.length - 1])) {
    return { pre: w.slice(0, -2).join(' '), main: 'Vô Danh' };
  }
  if (w.length <= 1) return { pre: '', main: w[0] || '' };
  return { pre: w.slice(0, -1).join(' '), main: w[w.length - 1] };
};

GP.fold = function (s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
};

GP.esc = function (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

GP.motherIndex = function (ix, p) {
  var parent = ix.byId[p.parent];
  if (!parent || !parent.spouses || parent.spouses.length < 2 || !p.mother) return 0;
  return p.mother;
};

/* ---------- layout ---------- */

GP.cardHeight = function (p) {
  return p.spouses && p.spouses.length ? 95 + p.spouses.length * 17 : 86;
};

/* Tidy tree, either top-down ("td": one row per generation) or left-to-right ("lr": one column per
 * generation). Everyone of a generation sits on the same row/column. Each subtree keeps a contour (its
 * near/far edge per depth) so a shallow branch can tuck beside a deep neighbour; siblings sit closer
 * than cousins. */
GP.layout = function (ix, mode) {
  var S = GP.SIZE, W = S.cardW, lr = mode === 'lr';
  var gapSib = lr ? 26 : S.sibGap, gapCousin = lr ? 40 : S.cousinGap, colGap = 84;
  function size(p) { return lr ? GP.cardHeight(p) : W; }
  function build(p) {
    var ch = ix.kids[p.id], half = size(p) / 2;
    if (!ch.length) return { p: p, x: 0, kids: [], left: [-half], right: [half] };
    var subs = ch.map(build), left = [], right = [];
    subs.forEach(function (s, i) {
      if (i > 0) {
        var shift = -Infinity;
        for (var d = 0; d < Math.min(right.length, s.left.length); d++) {
          shift = Math.max(shift, right[d] - s.left[d] + (d === 0 ? gapSib : gapCousin));
        }
        s.x = shift;
      }
      for (var e = 0; e < s.left.length; e++) {
        left[e] = left[e] === undefined ? s.left[e] + s.x : Math.min(left[e], s.left[e] + s.x);
        right[e] = right[e] === undefined ? s.right[e] + s.x : Math.max(right[e], s.right[e] + s.x);
      }
    });
    var mid = (subs[0].x + subs[subs.length - 1].x) / 2;
    subs.forEach(function (s) { s.x -= mid; });
    return {
      p: p, x: 0, kids: subs,
      left: [-half].concat(left.map(function (v) { return v - mid; })),
      right: [half].concat(right.map(function (v) { return v - mid; })),
    };
  }
  var forest = ix.roots.map(build), along = {}, lo = Infinity, hi = -Infinity, offset = 0;
  forest.forEach(function (t, i) {
    if (i > 0) offset += Math.max.apply(null, forest[i - 1].right) - Math.min.apply(null, t.left) + gapCousin * 2;
    (function place(n, b) {
      var half = size(n.p) / 2;
      along[n.p.id] = b; lo = Math.min(lo, b - half); hi = Math.max(hi, b + half);
      n.kids.forEach(function (k) { place(k, b + k.x); });
    })(t, offset);
  });
  // depth of each generation band: tallest card of the row (td) or card width (lr)
  var rowH = [], maxGen = 0;
  ix.data.people.forEach(function (p) {
    var g = ix.gen[p.id]; maxGen = Math.max(maxGen, g);
    rowH[g] = Math.max(rowH[g] || 0, lr ? W : GP.cardHeight(p));
  });
  var depthAt = [], depth = lr ? S.marginTop + 86 : S.marginTop;
  for (var g = 1; g <= maxGen; g++) { depthAt[g] = depth; depth += (rowH[g] || 0) + (lr ? colGap : S.rowGap); }
  var pos = {}, shift = (lr ? S.marginTop + 86 : S.marginX + S.labelW) - lo;
  ix.data.people.forEach(function (p) {
    var g = ix.gen[p.id], h = GP.cardHeight(p), b = along[p.id] + shift, d = depthAt[g];
    pos[p.id] = lr
      ? { x: d, y: b - h / 2, w: W, h: h, cx: d + W / 2, cy: b }
      : { x: b - W / 2, y: d, w: W, h: h, cx: b, cy: d + h / 2 };
  });
  var breadth = hi - lo, depthEnd = depth - (lr ? colGap : S.rowGap);
  return {
    mode: lr ? 'lr' : 'td', pos: pos, depthAt: depthAt, rowH: rowH, maxGen: maxGen, colGap: colGap,
    width: lr ? depthEnd + S.marginX : breadth + S.marginX * 2 + S.labelW,
    height: lr ? breadth + S.marginTop + 86 + S.marginBottom : depthEnd + S.marginBottom,
  };
};

/* Orthogonal connector from a parent card to one child card. */
GP.edgePath = function (L, a, b, g) {
  if (L.mode === 'lr') {
    var barX = L.depthAt[g] - L.colGap / 2;
    return 'M' + (a.x + a.w) + ' ' + a.cy + 'H' + barX + 'V' + b.cy + 'H' + b.x;
  }
  var barY = L.depthAt[g] - GP.SIZE.rowGap / 2 + 4;
  return 'M' + a.cx + ' ' + (a.y + a.h) + 'V' + barY + 'H' + b.cx + 'V' + b.y;
};

/* ---------- icons ---------- */

/* Person glyphs drawn in a 40x40 box: man with a traditional turban (khăn đóng), woman with a hair bun. */
GP.ICON = {
  m: '<circle cx="20" cy="20" r="20" fill="#1f3c74"/>' +
     '<path d="M8 36c1.5-7 6.5-10 12-10s10.5 3 12 10" fill="#f3dfc1"/>' +
     '<path d="M15 31h10l-5 7z" fill="#1f3c74" opacity=".55"/>' +
     '<circle cx="20" cy="18" r="7.2" fill="#f7e6cc"/>' +
     '<path d="M11.8 15.5c0-4.6 3.7-7.6 8.2-7.6s8.2 3 8.2 7.6c-2.6-1.2-5.3-1.7-8.2-1.7s-5.6.5-8.2 1.7z" fill="#0d1b36"/>' +
     '<path d="M12.5 13.2c2.4-1 5-1.5 7.5-1.5s5.1.5 7.5 1.5" stroke="#d9b45a" stroke-width="1.1" fill="none"/>',
  f: '<circle cx="20" cy="20" r="20" fill="#a3324f"/>' +
     '<path d="M8 36c1.5-7 6.5-10 12-10s10.5 3 12 10" fill="#f6d9df"/>' +
     '<circle cx="20" cy="9.6" r="3.9" fill="#2b1414"/>' +
     '<circle cx="20" cy="18.5" r="7.2" fill="#f7e6cc"/>' +
     '<path d="M12.6 19c-.6-5.6 2.6-9.4 7.4-9.4s8 3.8 7.4 9.4c-1-3.4-3.6-5.6-7.4-5.6s-6.4 2.2-7.4 5.6z" fill="#2b1414"/>' +
     '<circle cx="23.4" cy="9" r="1.1" fill="#e6b84a"/>',
  u: '<circle cx="20" cy="20" r="20" fill="#7a7468"/>' +
     '<path d="M8 36c1.5-7 6.5-10 12-10s10.5 3 12 10" fill="#ece6da"/>' +
     '<circle cx="20" cy="18" r="7.2" fill="#ece6da"/>',
};

/* ---------- SVG rendering ---------- */

GP.renderTree = function (ix, L) {
  var S = GP.SIZE, out = [], T = GP.THEME;
  // generation bands
  out.push('<g class="bands">');
  for (var g = 1; g <= L.maxGen; g++) {
    var r = L.mode === 'lr'
      ? { x: L.depthAt[g] - L.colGap / 2, y: 0, w: L.rowH[g] + L.colGap, h: L.height }
      : { x: 0, y: L.depthAt[g] - S.rowGap / 2 + 6, w: L.width, h: L.rowH[g] + S.rowGap };
    out.push('<rect class="band' + (g % 2 ? ' odd' : '') + '" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>');
  }
  out.push('</g>');
  // connectors: one path per child so a single line of descent can be highlighted
  out.push('<g class="edges">');
  ix.data.people.forEach(function (c) {
    var par = ix.byId[c.parent]; if (!par) return;
    var d = GP.edgePath(L, L.pos[par.id], L.pos[c.id], ix.gen[c.id]);
    var mi = GP.motherIndex(ix, c);
    out.push('<path id="e-' + c.id + '" class="edge" d="' + d + '" stroke="' + GP.colorOf(ix, c.id) + '"' +
      (mi ? ' data-mother="' + mi + '"' : '') + '/>');
  });
  out.push('</g>');
  // cards
  out.push('<g class="cards">');
  ix.data.people.forEach(function (p) { out.push(GP.renderCard(ix, L, p)); });
  out.push('</g>');
  return out.join('');
};

/* Fit a card text line into `avail` px. Without a browser the width is estimated from the character
 * count (emFactor ≈ average glyph width / font size, chosen on the generous side); when it may overflow,
 * SVG squeezes the line to exactly `avail`. data-fit lets GP.fitTexts redo this with real measurements. */
GP.fitAttrs = function (text, fontSize, emFactor, avail) {
  var est = String(text).length * fontSize * emFactor;
  return ' data-fit="' + avail + '"' + (est > avail ? ' textLength="' + avail + '" lengthAdjust="spacingAndGlyphs"' : '');
};

/* Browser pass: measure every fitted line and squeeze only the ones that really overflow. */
GP.fitTexts = function (root) {
  [].forEach.call(root.querySelectorAll('text[data-fit]'), function (t) {
    t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust');
    var avail = +t.getAttribute('data-fit');
    if (t.getComputedTextLength() > avail) { t.setAttribute('textLength', avail); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  });
};

GP.renderCard = function (ix, L, p) {
  var b = L.pos[p.id], col = GP.colorOf(ix, p.id), S = GP.SIZE, n = GP.splitName(p.name), x = S.padX + 46;
  var title = (GP.genderLabel(p.gender) ? GP.genderLabel(p.gender) + ' ' : '') + n.pre;
  var mainSize = n.main.length > 9 ? 17 : 20;
  var s = ['<g id="c-' + p.id + '" class="card g-' + (p.gender || 'u') + '" data-id="' + p.id + '" transform="translate(' + b.x + ' ' + b.y + ')">'];
  s.push('<rect class="halo" x="-3" y="-3" width="' + (b.w + 6) + '" height="' + (b.h + 6) + '" rx="14"/>');
  s.push('<rect class="card-bg" width="' + b.w + '" height="' + b.h + '" rx="12"/>');
  // colour strip of height 7 that follows the card's 12px corner radius exactly
  var r = 12, sh = 7, cut = r - Math.sqrt(r * r - (r - sh) * (r - sh));
  s.push('<path class="card-top" d="M' + cut + ' ' + sh + 'A' + r + ' ' + r + ' 0 0 1 ' + r + ' 0H' + (b.w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' +
    (b.w - cut) + ' ' + sh + 'Z" fill="' + col + '"/>');
  s.push('<rect class="card-frame" width="' + b.w + '" height="' + b.h + '" rx="12" stroke="' + col + '"/>');
  s.push('<g transform="translate(' + S.padX + ' 16)">' + GP.ICON[p.gender || 'u'] + '</g>');
  var avail = b.w - x - 10;
  s.push('<text class="t-pre" x="' + x + '" y="' + S.nameTop + '"' + GP.fitAttrs(title, 13, 0.56, avail) + '>' + GP.esc(title) + '</text>');
  s.push('<text class="t-main" x="' + x + '" y="' + (S.nameTop + 22) + '" style="font-size:' + mainSize + 'px"' +
    GP.fitAttrs(n.main, mainSize, 0.64, avail) + '>' + GP.esc(n.main) + '</text>');
  var info = [];
  if (p.death) info.push('Giỗ ' + p.death);
  if (p.mark) info.push('(' + p.mark + ')');
  if (info.length) s.push('<text class="t-info" x="' + x + '" y="' + (S.nameTop + 41) + '">' + GP.esc(info.join('  ')) + '</text>');
  if (p.order != null) {
    s.push('<g class="order" transform="translate(' + (b.w - 18) + ' 0)"><circle r="10.5"/><text y="4.2">' + p.order + '</text></g>');
  }
  var mi = GP.motherIndex(ix, p);
  if (mi) {
    var lab = 'Con ' + GP.THEME.wifeLabel[mi - 1], wl = lab.length * 6.2 + 14;
    s.push('<g class="mother" transform="translate(12 -9)"><rect width="' + wl + '" height="17" rx="8.5" fill="' +
      GP.THEME.wife[(mi - 1) % 3] + '"/><text x="' + wl / 2 + '" y="12.4">' + GP.esc(lab) + '</text></g>');
  }
  (p.spouses || []).forEach(function (sp, i) {
    var y = 100 + i * 17, rel = p.gender === 'f' ? 'Chồng' : (p.spouses.length > 1 ? 'Vợ ' + (i + 1) : 'Vợ');
    var spName = (GP.genderLabel(sp.gender) ? GP.genderLabel(sp.gender) + ' ' : '') + sp.name;
    if (i === 0) s.push('<line class="sp-sep" x1="10" x2="' + (b.w - 10) + '" y1="82" y2="82"/>');
    s.push('<text class="t-sp" x="12" y="' + y + '"' + GP.fitAttrs(rel + ': ' + spName, 11.8, 0.56, b.w - 22) + '><tspan class="sp-rel">' + rel +
      ':</tspan> ' + GP.esc(spName) + '</text>');
  });
  s.push('</g>');
  return s.join('');
};

/* Header scaled to the width it sits over: { svg, height }. */
GP.posterHead = function (ix, width) {
  var s = Math.max(1, Math.min(2.6, width / 2000));
  return { svg: '<g transform="scale(' + s + ')">' + GP.renderHeader(ix, width / s) + '</g>', height: 300 * s };
};

GP.renderLabels = function (L) {
  var out = ['<g class="gen-labels">'];
  for (var g = 1; g <= L.maxGen; g++) {
    var at = L.mode === 'lr'
      ? (L.depthAt[g] + L.rowH[g] / 2) + ' ' + (GP.SIZE.marginTop + 34)
      : (GP.SIZE.marginX + 8) + ' ' + (L.depthAt[g] + L.rowH[g] / 2);
    out.push('<g class="gen-label" transform="translate(' + at + ')">' +
      '<circle r="30"/><text class="gl-small" y="-7">ĐỜI</text><text class="gl-num" y="15">' + g + '</text></g>');
  }
  out.push('</g>');
  return out.join('');
};

/* ---------- static poster (image / print view) ---------- */

GP.stats = function (ix) {
  var phai = {};
  ix.data.people.forEach(function (p) { var ph = GP.phaiOf(ix, p.id); if (ph) phai[ph] = 1; });
  var maxGen = 0;
  Object.keys(ix.gen).forEach(function (id) { maxGen = Math.max(maxGen, ix.gen[id]); });
  return { people: ix.data.people.length, gens: maxGen, phai: Object.keys(phai).length };
};

/* Red square seal with the Hán character of the family name (曾 = Tăng). */
GP.seal = function (size) {
  return '<g class="seal"><rect width="' + size + '" height="' + size + '" rx="' + size * 0.12 + '"/>' +
    '<rect class="seal-in" x="' + size * 0.07 + '" y="' + size * 0.07 + '" width="' + size * 0.86 + '" height="' + size * 0.86 + '" rx="' + size * 0.08 + '"/>' +
    '<text x="' + size / 2 + '" y="' + size * 0.74 + '" style="font-size:' + size * 0.66 + 'px">曾</text></g>';
};

/* Standalone logo document (used for dist/logo.svg and the favicon). Colours are inline because the
 * file is shown without the page stylesheet. */
GP.logoSvg = function () {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 92" width="512" height="512">' +
    '<rect width="92" height="92" rx="11" fill="#a8231f"/>' +
    '<rect x="6.4" y="6.4" width="79.2" height="79.2" rx="7.4" fill="none" stroke="#f5d9a0" stroke-width="2.4"/>' +
    '<text x="46" y="68" text-anchor="middle" font-size="60" font-weight="700" fill="#fff3dc" ' +
    'font-family="Noto Serif SC, Songti SC, STSong, SimSun, PingFang SC, Microsoft YaHei, serif">曾</text></svg>';
};

GP.cloud = function () {
  return '<path class="cloud" d="M0 18c6-10 18-10 22-2 4-9 18-9 22 0 3-6 12-6 15 0M10 26c5-6 12-6 16 0 4-6 12-6 16 0"/>';
};

GP.renderHeader = function (ix, width) {
  var st = GP.stats(ix), m = ix.data.meta || {}, cx = width / 2;
  return '<g class="poster-head">' +
    '<g transform="translate(' + (cx - 46) + ' 26)">' + GP.seal(92) + '</g>' +
    '<text class="ph-title" x="' + cx + '" y="190">' + GP.esc((m.title || 'Gia phả').toUpperCase()) + '</text>' +
    '<g transform="translate(' + (cx - 300) + ' 220)">' + GP.cloud() + '</g>' +
    '<g transform="translate(' + (cx + 300) + ' 220) scale(-1 1)">' + GP.cloud() + '</g>' +
    '<text class="ph-sub" x="' + cx + '" y="240">' + GP.esc(m.subtitle || '') + '</text>' +
    '<text class="ph-stats" x="' + cx + '" y="276">' + st.people + ' người  ·  ' + st.gens + ' đời  ·  ' + st.phai + ' phái</text>' +
    '</g>';
};

GP.renderLegend = function (ix, x, y, width) {
  var T = GP.THEME, m = ix.data.meta || {}, out = ['<g class="legend" transform="translate(' + x + ' ' + y + ')">'];
  out.push('<rect class="lg-box" width="' + width + '" height="330" rx="18"/>');
  out.push('<text class="lg-h" x="28" y="46">Chú thích</text>');
  var cx = 28, cy = 84;
  Object.keys(T.phai).forEach(function (k, i) {
    out.push('<rect x="' + (cx + i * 150) + '" y="' + (cy - 14) + '" width="30" height="18" rx="5" fill="' + T.phai[k] + '"/>' +
      '<text class="lg-t" x="' + (cx + i * 150 + 40) + '" y="' + cy + '">Phái ' + k + '</text>');
  });
  cy += 40;
  [0, 1, 2].forEach(function (i) {
    var lab = 'Con ' + T.wifeLabel[i];
    out.push('<rect x="' + (cx + i * 150) + '" y="' + (cy - 14) + '" width="' + (lab.length * 6.2 + 14) + '" height="17" rx="8.5" fill="' + T.wife[i] + '"/>' +
      '<text class="lg-chip" x="' + (cx + i * 150 + (lab.length * 6.2 + 14) / 2) + '" y="' + (cy - 1.6) + '">' + lab + '</text>');
  });
  out.push('<text class="lg-t" x="' + (cx + 470) + '" y="' + cy + '">mẹ của người con khi cha có nhiều vợ</text>');
  cy += 44;
  [['m', 'Ông (nam)'], ['f', 'Bà (nữ)'], ['u', 'Chưa ghi rõ']].forEach(function (g, i) {
    out.push('<g transform="translate(' + (cx + i * 190) + ' ' + (cy - 22) + ') scale(.8)">' + GP.ICON[g[0]] + '</g>' +
      '<text class="lg-t" x="' + (cx + i * 190 + 42) + '" y="' + cy + '">' + g[1] + '</text>');
  });
  cy += 44;
  out.push('<g class="order" transform="translate(' + (cx + 10) + ' ' + (cy - 5) + ')"><circle r="10.5"/><text y="4.2">3</text></g>' +
    '<text class="lg-t" x="' + (cx + 30) + '" y="' + cy + '">Ngôi thứ trong anh chị em (số nhỏ là anh/chị)</text>');
  cy += 36;
  out.push('<text class="lg-t" x="' + cx + '" y="' + cy + '"><tspan class="lg-b">Giỗ 8/12</tspan>  ngày giỗ theo âm lịch   ·   <tspan class="lg-b">(c)</tspan>  ký hiệu chép theo bản gốc 2007</text>');
  cy += 36;
  if (m.anniversary) out.push('<text class="lg-t" x="' + cx + '" y="' + cy + '">' + GP.esc(m.anniversary) + '</text>');
  out.push('</g>');
  return out.join('');
};

GP.noteLines = function (ix, width) {
  var m = ix.data.meta || {}, lines = [], perLine = Math.floor((width - 56) / 6.9);
  (m.history || []).forEach(function (para, i) {
    if (i) lines.push('');
    var cur = '';
    para.split(' ').forEach(function (w) {
      if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
    });
    lines.push(cur.trim());
  });
  return lines;
};
GP.notesHeight = function (ix, width) {
  return 100 + GP.noteLines(ix, width).length * 18 + GP.creditLines(ix.data.meta || {}).length * 19;
};

GP.renderNotes = function (ix, x, y, width) {
  var m = ix.data.meta || {}, lines = GP.noteLines(ix, width), hgt = GP.notesHeight(ix, width);
  var out = ['<g class="notes" transform="translate(' + x + ' ' + y + ')">'];
  out.push('<rect class="lg-box" width="' + width + '" height="' + hgt + '" rx="18"/>');
  out.push('<text class="lg-h" x="28" y="46">Lời dặn của tộc</text>');
  lines.forEach(function (l, i) { out.push('<text class="nt-t" x="28" y="' + (84 + i * 18) + '">' + GP.esc(l) + '</text>'); });
  var credits = GP.creditLines(m);
  credits.forEach(function (c, i) {
    out.push('<text class="nt-credit" x="28" y="' + (hgt - 22 - (credits.length - 1 - i) * 19) + '">' + GP.esc(c) + '</text>');
  });
  out.push('</g>');
  return out.join('');
};

/* Empty rectangle left of the generations whose cards sit in a narrow vertical range (in the
 * left-to-right layout the first generations leave large blank areas above and below them).
 * Returns { x, y0, y1, top, bottom } in tree coordinates, or null. */
GP.freeArea = function (ix, L) {
  if (L.mode !== 'lr') return null;
  var best = null;
  for (var g = 2; g <= L.maxGen; g++) {
    var lo = Infinity, hi = -Infinity;
    ix.data.people.forEach(function (p) {
      if (ix.gen[p.id] > g) return;
      var b = L.pos[p.id]; lo = Math.min(lo, b.y); hi = Math.max(hi, b.y + b.h);
    });
    var right = L.depthAt[g + 1] ? L.depthAt[g + 1] - L.colGap : L.width;
    var area = { x: GP.SIZE.marginX, w: right - GP.SIZE.marginX - 30, top: [L.depthAt[1] - 20, lo - 50], bottom: [hi + 50, L.height - GP.SIZE.marginBottom] };
    if (area.top[1] - area.top[0] < 600) break;
    if (area.w >= 900) best = area;
  }
  return best;
};

/* Whole poster: header, tree, generation labels, legend and notes. Returns { svg, width, height }. */
GP.renderStatic = function (data, mode) {
  var ix = GP.index(data), L = GP.layout(ix, mode), width = Math.max(L.width, 1500);
  var ph = GP.posterHead(ix, width), s = Math.max(1, Math.min(2.6, width / 2000)), head = ph.height, treeX = (width - L.width) / 2;
  var free = GP.freeArea(ix, L), boxW = 820, body = [], foot = 0;
  function box(fn, x, y, sc) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')">' + fn(ix, 0, 0, boxW) + '</g>'; }
  if (free) {
    // legend in the blank area above the first generations, notes in the one below
    var sc = Math.min(s * 1.2, free.w / boxW, (free.top[1] - free.top[0]) / 340);
    body.push(box(GP.renderLegend, treeX + free.x, head + free.top[1] - 340 * sc, sc));
    var nh = GP.notesHeight(ix, boxW), sc2 = Math.min(s * 1.2, free.w / boxW, (free.bottom[1] - free.bottom[0]) / nh);
    if (sc2 > 0.8) body.push(box(GP.renderNotes, treeX + free.x, head + free.bottom[0], sc2));
    else foot = nh + 60;
    if (foot) body.push(box(GP.renderNotes, width / 2 - boxW / 2, head + L.height + 20, 1));
  } else {
    foot = Math.max(380, GP.notesHeight(ix, boxW) + 60);
    body.push(box(GP.renderLegend, width / 2 - boxW - 20, head + L.height + 20, 1));
    body.push(box(GP.renderNotes, width / 2 + 20, head + L.height + 20, 1));
  }
  var height = head + L.height + foot;
  var svg = '<rect class="paper" width="' + width + '" height="' + height + '"/>' +
    '<rect class="poster-frame" x="14" y="14" width="' + (width - 28) + '" height="' + (height - 28) + '" rx="22"/>' +
    ph.svg +
    '<g transform="translate(' + treeX + ' ' + head + ')">' + GP.renderTree(ix, L) + GP.renderLabels(L) + '</g>' +
    body.join('');
  return { svg: svg, width: Math.ceil(width), height: Math.ceil(height) };
};

if (typeof module !== 'undefined') module.exports = GP;
