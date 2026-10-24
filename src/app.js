/* Interactive viewer and editor. Runs inside the published gia-pha.svg and index.html.
 * The document carries its own data (#gp-data) and a static drawing (#gp-static) for viewers
 * without scripts; this file hides the static drawing and builds the live tree + UI on top. */
(function () {
  'use strict';
  var XH = 'http://www.w3.org/1999/xhtml', SV = 'http://www.w3.org/2000/svg';
  var root = document.getElementById('gp-root'), dataEl = document.getElementById('gp-data');
  if (!root || !dataEl) return;
  var isSvgDoc = document.documentElement === root;
  var srcText = dataEl.textContent, docKey = 'gp:' + hash(srcText);
  var S = {
    data: JSON.parse(srcText), ix: null, L: null, sel: null, cam: { x: 0, y: 0, k: 1 },
    mode: store('gp:mode') || 'lr',
    edit: false, dirty: false, history: [], anim: 0,
  };
  var staticAttrs = { viewBox: root.getAttribute('viewBox'), width: root.getAttribute('width'), height: root.getAttribute('height') };

  /* ---------- tiny helpers ---------- */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function store(k, v) {
    try { if (arguments.length > 1) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } else return localStorage.getItem(k); }
    catch (e) { return null; }
  }
  function h(tag, attrs, kids) {
    var el = document.createElementNS(XH, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function svgFrag(markup) {
    var doc = new DOMParser().parseFromString('<svg xmlns="' + SV + '">' + markup + '</svg>', 'image/svg+xml');
    var frag = document.createDocumentFragment();
    [].slice.call(doc.documentElement.childNodes).forEach(function (n) { frag.appendChild(document.importNode(n, true)); });
    return frag;
  }
  function svgIcon(markup, size) {
    var s = document.createElementNS(SV, 'svg');
    s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.appendChild(svgFrag(markup));
    return s;
  }
  var I = { // 24px line icons
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    rotate: '<path d="M4 7h11a4 4 0 0 1 4 4v6"/><path d="M16 14l3 3 3-3"/><path d="M4 7l3-3M4 7l3 3"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    data: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    scroll: '<path d="M8 4h10a2 2 0 0 1 2 2v2h-4"/><path d="M16 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h9"/><path d="M8 4a2 2 0 0 0-2 2v11"/><path d="M9.5 9h3.5M9.5 12.5h3.5"/>',
    legend: '<rect x="4" y="5" width="5" height="4" rx="1"/><rect x="4" y="11" width="5" height="4" rx="1"/><rect x="4" y="17" width="5" height="2" rx="1"/><path d="M12 7h8M12 13h8M12 18h6"/>',
  };
  function icon(name) {
    var s = document.createElementNS(SV, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.appendChild(svgFrag(I[name]));
    return s;
  }
  function btn(iconName, label, onclick, cls, title) {
    return h('button', { 'class': 'ibtn pe ' + (cls || ''), type: 'button', onclick: onclick, title: title || label, 'aria-label': title || label },
      [iconName ? icon(iconName) : null, label ? h('span', { 'class': 'lbl' + (iconName ? ' hide-sm' : '') }, label) : null]);
  }
  function fullName(p) { return (GP.genderLabel(p.gender) ? GP.genderLabel(p.gender) + ' ' : '') + p.name; }
  var WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  function dmy(d) { return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

  /* ---------- mount ---------- */
  var staticG = document.getElementById('gp-static');
  // the static drawing reuses the same element ids as the live tree, so take it out of the DOM;
  // printing and saving render it again from the current data
  if (staticG) { staticG.setAttribute('display', 'none'); while (staticG.firstChild) staticG.removeChild(staticG.firstChild); }
  ['viewBox', 'width', 'height'].forEach(function (a) { root.removeAttribute(a); });
  root.setAttribute('width', '100%'); root.setAttribute('height', '100%');
  root.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none';
  if (!isSvgDoc) document.body.style.cssText = 'margin:0;overflow:hidden;background:#f6efe2';

  var live = document.createElementNS(SV, 'g'); live.id = 'gp-live';
  live.appendChild(svgFrag('<rect class="paper" width="100%" height="100%"/><g id="gp-cam"><g id="gp-head"/><g id="gp-tree"/></g><g id="gp-genlabels"/>'));
  root.appendChild(live);
  var cam = document.getElementById('gp-cam'), treeG = document.getElementById('gp-tree'), labelsG = document.getElementById('gp-genlabels');
  var headG = document.getElementById('gp-head');

  var ui = h('div', { 'class': 'ui', id: 'gp-ui-root' });
  if (isSvgDoc) {
    var fo = document.createElementNS(SV, 'foreignObject');
    fo.id = 'gp-ui'; fo.setAttribute('x', 0); fo.setAttribute('y', 0); fo.setAttribute('width', '100%'); fo.setAttribute('height', '100%');
    fo.style.pointerEvents = 'none';
    fo.appendChild(ui); root.appendChild(fo);
  } else {
    ui.id = 'gp-ui'; document.body.appendChild(ui);
  }

  /* Phones open a bare SVG file at a ~980px desktop viewport (an SVG cannot declare a viewport),
   * so zoom the UI back to the real screen width; the tree has its own camera and is unaffected. */
  function uiMetrics() {
    var sw = screen && screen.width ? Math.min(screen.width, screen.height || screen.width) : innerWidth;
    var f = isSvgDoc && sw < 760 && innerWidth > sw * 1.3 ? innerWidth / sw : 1;
    S.uiScale = f;
    ui.style.zoom = f === 1 ? '' : f; // percentages inside resolve against the zoomed box, so width/height stay 100%
    var ew = innerWidth / f;
    ui.classList.toggle('sm', ew <= 760); ui.classList.toggle('xs', ew <= 520);
  }
  uiMetrics();

  /* ---------- top bar ---------- */
  var brandSeal = document.createElementNS(SV, 'svg');
  brandSeal.setAttribute('viewBox', '0 0 92 92'); brandSeal.setAttribute('width', 42); brandSeal.setAttribute('height', 42);
  brandSeal.appendChild(svgFrag(GP.seal(92)));
  var searchInput = h('input', { type: 'search', placeholder: 'Tìm tên người…', 'aria-label': 'Tìm tên người', autocomplete: 'off' });
  var results = h('div', { 'class': 'results', hidden: true });
  var editBtn = btn('edit', 'Chỉnh sửa', function () { setEdit(!S.edit); }, '', 'Bật/tắt chế độ chỉnh sửa');
  var top = h('div', { 'class': 'topbar pe' }, [
    h('div', { 'class': 'brand' }, [brandSeal, h('div', {}, [
      h('div', { 'class': 'bt' }, S.data.meta.title || 'Gia phả'),
      h('div', { 'class': 'bs' }, S.data.meta.subtitle || '')])]),
    h('div', { 'class': 'grow hide-sm' }),
    h('div', { 'class': 'search' }, [icon('search'), searchInput, results]),
    btn('cal', 'Ngày giỗ', openAnniversaries, '', 'Ngày giỗ sắp tới'),
    btn('scroll', 'Lời dặn', openTestament, '', 'Lời dặn của tộc'),
    btn('info', 'Hướng dẫn', openAbout, '', 'Hướng dẫn xem và người làm gia phả'),
    editBtn,
  ]);
  top.querySelector('.search > svg').setAttribute('class', 'si');
  ui.appendChild(top);

  var zoom = h('div', { 'class': 'zoom' }, [
    btn('rotate', '', function () { setMode(S.mode === 'lr' ? 'td' : 'lr'); }, '', 'Xoay cây: dọc / ngang'),
    btn('plus', '', function () { zoomBy(1.4); }, '', 'Phóng to'),
    btn('minus', '', function () { zoomBy(1 / 1.4); }, '', 'Thu nhỏ'),
    btn('fit', '', function () { fit(true); }, '', 'Xem toàn bộ cây'),
    btn('home', '', function () { select(S.ix.roots[0].id, true); }, '', 'Về Thủy tổ'),
  ]);
  ui.appendChild(zoom);

  /* legend card on the canvas (bottom-left); open by default on wide screens, remembered per viewer */
  var legendOpen = store('gp:legend') ? store('gp:legend') === '1' : !ui.classList.contains('sm');
  var legend = h('div', { 'class': 'legend-card pe' + (legendOpen ? ' open' : '') }, [
    h('button', { 'class': 'lg-toggle', type: 'button', 'aria-expanded': String(legendOpen), onclick: function () {
      legendOpen = !legendOpen; legend.classList.toggle('open', legendOpen);
      this.setAttribute('aria-expanded', String(legendOpen)); store('gp:legend', legendOpen ? '1' : '0');
    } }, [icon('legend'), h('span', {}, 'Chú thích'), h('span', { 'class': 'chev' }, '▾')]),
    h('div', { 'class': 'lg-body' }, [
      h('div', { 'class': 'lg-grid' }, Object.keys(GP.THEME.phai).map(function (k) {
        return h('span', { 'class': 'lg-item' }, [h('span', { 'class': 'sw', style: 'background:' + GP.THEME.phai[k] }), 'Phái ' + k]); })),
      h('div', { 'class': 'lg-cap' }, 'Khi cha có nhiều vợ:'),
      h('div', { 'class': 'lg-grid' }, [0, 1, 2].map(function (i) {
        return h('span', { 'class': 'lg-chip', style: 'background:' + GP.THEME.wife[i] }, 'Con ' + GP.THEME.wifeLabel[i]); })),
      h('div', { 'class': 'lg-grid' }, [['m', 'Ông'], ['f', 'Bà'], ['u', 'Chưa rõ']].map(function (g) {
        return h('span', { 'class': 'lg-item' }, [svgIcon(GP.ICON[g[0]], 24), g[1]]); })),
      h('div', { 'class': 'lg-line' }, [h('span', { 'class': 'lg-ord' }, '3'), 'Ngôi thứ (số nhỏ là anh/chị)']),
      h('div', { 'class': 'lg-line' }, [h('b', {}, 'Giỗ 8/12'), ' ngày giỗ âm lịch']),
      h('div', { 'class': 'lg-line' }, [h('b', {}, '(c)'), ' ký hiệu chép theo bản gốc']),
    ])]);
  ui.appendChild(legend);
  var panel = h('div', { 'class': 'panel pe', role: 'dialog', 'aria-label': 'Thông tin người' });
  ui.appendChild(panel);
  var editbar = null, toastEl = null;

  /* ---------- render ---------- */
  function rebuild() {
    S.ix = GP.index(S.data); S.L = GP.layout(S.ix, S.mode);
    // poster header centred over the first five generations: cây ngang puts it in the empty columns right
    // above them (each column holds one generation); cây dọc puts it above the tree, shifting the tree down
    var L = S.L, lr = L.mode === 'lr', x0 = Infinity, x1 = -Infinity, top5 = Infinity;
    S.data.people.forEach(function (p) {
      if (S.ix.gen[p.id] > 5) return;
      var b = L.pos[p.id]; x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); top5 = Math.min(top5, b.y);
    });
    if (lr) { x0 = 0; x1 = L.depthAt[6] || L.width; } else { x0 -= 300; x1 += 300; }
    var ph = GP.posterHead(S.ix, x1 - x0), hy = lr ? Math.max(0, top5 - ph.height - 30) : 0;
    S.headH = lr ? 0 : ph.height; S.headBox = { y: hy, h: ph.height };
    while (headG.firstChild) headG.removeChild(headG.firstChild);
    headG.appendChild(svgFrag(ph.svg));
    headG.setAttribute('transform', 'translate(' + x0 + ' ' + hy + ')');
    treeG.setAttribute('transform', 'translate(0 ' + S.headH + ')');
    while (treeG.firstChild) treeG.removeChild(treeG.firstChild);
    treeG.appendChild(svgFrag(GP.renderTree(S.ix, S.L)));
    GP.fitTexts(treeG);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { GP.fitTexts(treeG); });
    while (labelsG.firstChild) labelsG.removeChild(labelsG.firstChild);
    labelsG.appendChild(svgFrag(GP.renderLabels(S.L)));
    if (S.sel && !S.ix.byId[S.sel]) S.sel = null;
    applySelection(); applyCamera();
  }

  /* ---------- camera ---------- */
  function viewRect() {
    var f = S.uiScale, topY = (S.mode === 'lr' ? 112 : 60) * f, w = innerWidth, hgt = innerHeight, r = { x: 0, y: topY, w: w, h: hgt - topY };
    if (panel.classList.contains('open')) {
      if (!ui.classList.contains('sm')) r.w -= 412 * f;
      else r.h = (S.sheet === 'peek' ? hgt - PEEK_H * f : hgt * 0.36) - topY;
    }
    return r;
  }
  function applyCamera() {
    var c = S.cam;
    cam.setAttribute('transform', 'translate(' + c.x + ' ' + c.y + ') scale(' + c.k + ')');
    var L = S.L, labs = labelsG.querySelectorAll('.gen-label');
    var step = (L.depthAt[2] - L.depthAt[1]) * c.k;
    labelsG.setAttribute('display', step < 46 ? 'none' : 'inline');
    for (var g = 1; g <= L.maxGen; g++) {
      var el = labs[g - 1]; if (!el) continue;
      var x, y, sc = Math.max(0.55, Math.min(1, c.k * 1.6));
      // cây ngang: labels sit at the top of the tree and stick under the top bar once scrolled past
      if (L.mode === 'lr') { x = c.x + (L.depthAt[g] + L.rowH[g] / 2) * c.k; y = Math.max(88 * S.uiScale, c.y + (S.headH + GP.SIZE.marginTop + 34) * c.k); sc = Math.min(sc, 0.75); }
      else { x = 36 * S.uiScale; y = c.y + (S.headH + L.depthAt[g] + L.rowH[g] / 2) * c.k; }
      sc *= S.uiScale;
      el.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + sc + ')');
      el.setAttribute('opacity', (L.mode === 'lr' ? x < 30 : y < 90 * S.uiScale) ? 0 : 1);
    }
  }
  function clampK(k) { return Math.max(0.04, Math.min(2.6 * (S.uiScale || 1), k)); }
  function animateTo(t, ms) {
    var from = { x: S.cam.x, y: S.cam.y, k: S.cam.k }, t0 = performance.now(), id = ++S.anim;
    function step(now) {
      if (id !== S.anim) return;
      var u = Math.min(1, (now - t0) / (ms || 650)), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      // interpolate zoom geometrically so fly-ins feel even
      var k = from.k * Math.pow(t.k / from.k, e);
      S.cam.k = k; S.cam.x = from.x + (t.x - from.x) * e; S.cam.y = from.y + (t.y - from.y) * e;
      applyCamera();
      if (u < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function fit(animated) {
    var r = viewRect(), L = S.L, pad = 24, H = L.height + S.headH;
    var k = clampK(Math.min((r.w - pad * 2) / L.width, (r.h - pad * 2) / H));
    var t = { k: k, x: r.x + (r.w - L.width * k) / 2, y: r.y + (r.h - H * k) / 2 };
    if (L.mode === 'lr' && H * k < r.h * 0.5) t.y = r.y + pad;
    if (animated) animateTo(t); else { S.cam = t; applyCamera(); }
  }
  /* frame the header and the people of the first `upto` generations */
  function fitGenerations(upto, animated) {
    var r = viewRect(), pad = 30, x0 = Infinity, y0 = S.headBox.y, x1 = -Infinity, y1 = -Infinity, H = S.headH;
    S.data.people.forEach(function (p) {
      if (S.ix.gen[p.id] > upto) return;
      var b = S.L.pos[p.id];
      x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + H + b.h);
    });
    if (S.L.mode === 'lr') { x0 = Math.min(x0, 0); x1 = Math.max(x1, S.L.depthAt[upto + 1] || x1); }
    var k = clampK(Math.min(1.1, (r.w - pad * 2) / (x1 - x0), (r.h - pad * 2) / (y1 - y0)));
    var t = { k: k, x: r.x + r.w / 2 - (x0 + x1) / 2 * k, y: r.y + r.h / 2 - (y0 + y1) / 2 * k };
    if (animated) animateTo(t, 1600); else { S.cam = t; applyCamera(); }
  }
  function centerOn(id, minK) {
    var f = S.uiScale, b = S.L.pos[id], r = viewRect(), k = clampK(Math.max(S.cam.k, (minK || 0.85) * f));
    if (r.h < 260 * f) k = Math.min(k, 0.9 * f);
    animateTo({ k: k, x: r.x + r.w / 2 - b.cx * k, y: r.y + r.h / 2 - (b.cy + S.headH) * k });
  }
  function zoomBy(f, cx, cy) {
    var r = viewRect(); cx = cx == null ? r.x + r.w / 2 : cx; cy = cy == null ? r.y + r.h / 2 : cy;
    var k = clampK(S.cam.k * f), s = k / S.cam.k;
    S.anim++;
    S.cam = { k: k, x: cx - (cx - S.cam.x) * s, y: cy - (cy - S.cam.y) * s };
    applyCamera();
  }

  /* pointer: drag to pan, pinch / wheel to zoom, tap to select */
  var ptrs = {}, gesture = null;
  root.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.ui')) return;
    root.setPointerCapture && root.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    S.anim++;
    var ids = Object.keys(ptrs);
    if (ids.length === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: { x: S.cam.x, y: S.cam.y, k: S.cam.k }, moved: 0, target: e.target };
    else if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, cam: { x: S.cam.x, y: S.cam.y, k: S.cam.k }, moved: 99 };
    }
  });
  root.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId] || !gesture) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (gesture.type === 'pan' && ids.length === 1) {
      var dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      gesture.moved = Math.max(gesture.moved, Math.abs(dx) + Math.abs(dy));
      S.cam.x = gesture.cam.x + dx; S.cam.y = gesture.cam.y + dy; applyCamera();
    } else if (gesture.type === 'pinch' && ids.length >= 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, k = clampK(gesture.cam.k * d / gesture.d), s = k / gesture.cam.k;
      S.cam = { k: k, x: cx - (gesture.cx - gesture.cam.x) * s, y: cy - (gesture.cy - gesture.cam.y) * s };
      applyCamera();
    }
  });
  function endPtr(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    if (gesture && gesture.type === 'pan' && gesture.moved < 8 && e.type === 'pointerup') {
      var card = gesture.target.closest && gesture.target.closest('.card');
      if (card) select(card.getAttribute('data-id'), true);
      else if (S.sel && ui.classList.contains('sm') && S.sheet !== 'peek') setSheet('peek');
      else if (S.sel) closePanel();
    }
    if (!Object.keys(ptrs).length) gesture = null;
    else if (gesture && gesture.type === 'pinch') {
      var id = Object.keys(ptrs)[0];
      gesture = { type: 'pan', sx: ptrs[id].x, sy: ptrs[id].y, cam: { x: S.cam.x, y: S.cam.y, k: S.cam.k }, moved: 99, target: root };
    }
  }
  root.addEventListener('pointerup', endPtr);
  root.addEventListener('pointercancel', endPtr);
  root.addEventListener('wheel', function (e) {
    if (e.target.closest && e.target.closest('.ui .pe')) return;
    e.preventDefault(); S.anim++;
    // scrolling (mouse wheel or two-finger swipe) always pans; zoom only on pinch (sent as ctrlKey) or Ctrl/⌘ + wheel
    if (e.ctrlKey || e.metaKey) {
      zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)), e.clientX, e.clientY);
    } else {
      var unit = e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? innerHeight : 1;
      var dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      S.cam.x -= dx; S.cam.y -= dy; applyCamera();
    }
  }, { passive: false });
  addEventListener('resize', function () { uiMetrics(); applyCamera(); });

  /* ---------- selection ---------- */
  function applySelection() {
    var lit = {}, id = S.sel;
    root.classList.toggle('focus', !!id);
    treeG.querySelectorAll('.card.sel,.card.lit,.edge.lit').forEach(function (el) { el.classList.remove('sel', 'lit'); });
    if (!id || !S.ix.byId[id]) return;
    GP.ancestors(S.ix, id).concat(GP.descendants(S.ix, id)).forEach(function (p) { lit[p.id] = 1; });
    Object.keys(lit).forEach(function (pid) {
      var c = document.getElementById('c-' + pid); if (c) c.classList.add('lit');
    });
    var chain = [id].concat(Object.keys(lit));
    chain.forEach(function (pid) { var e = document.getElementById('e-' + pid); if (e) e.classList.add('lit'); });
    var me = document.getElementById('c-' + id);
    if (me) { me.classList.add('sel'); me.parentNode.appendChild(me); }
  }
  function select(id, fly) {
    if (!S.ix.byId[id]) return;
    S.sel = id; applySelection(); renderPanel();
    panel.classList.add('open'); zoom.classList.add('up'); ui.classList.add('sheet-open');
    // phones: a short sheet so the highlighted line stays visible; swipe or tap it for details
    setSheet('peek', false);
    if (fly) centerOn(id);
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// may refuse */ }
  }
  function closePanel() {
    S.sel = null; applySelection(); panel.classList.remove('open'); zoom.classList.remove('up'); ui.classList.remove('sheet-open');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  /* ---------- bottom sheet (phones): peek shows name + chips, half and full show details ---------- */
  var PEEK_H = 178, SHEETS = ['peek', 'half', 'full'];
  function setSheet(st, recenter) {
    S.sheet = st;
    SHEETS.forEach(function (c) { panel.classList.toggle(c, c === st); });
    zoom.classList.toggle('peek', st === 'peek');
    if (recenter !== false && S.sel) centerOn(S.sel);
  }
  function stepSheet(dir) {
    var i = Math.max(0, Math.min(2, SHEETS.indexOf(S.sheet) + dir));
    if (SHEETS[i] !== S.sheet) setSheet(SHEETS[i]);
  }
  (function () {
    var y0 = null, moved = false;
    panel.addEventListener('pointerdown', function (e) {
      if (!ui.classList.contains('sm') || !e.target.closest('.grab, .ph') || e.target.closest('.close')) return;
      y0 = e.clientY; moved = false;
    });
    panel.addEventListener('pointermove', function (e) { if (y0 != null && Math.abs(e.clientY - y0) > 8) moved = true; });
    panel.addEventListener('pointerup', function (e) {
      if (y0 == null) return;
      var dy = e.clientY - y0; y0 = null;
      if (!moved) stepSheet(S.sheet === 'full' ? -1 : 1);
      else if (dy < -30) stepSheet(1);
      else if (dy > 30) stepSheet(-1);
    });
    panel.addEventListener('pointercancel', function () { y0 = null; });
  })();

  /* ---------- person panel ---------- */
  function personButton(p, meta) {
    return h('button', { 'class': 'pbtn', type: 'button', onclick: function () { select(p.id, true); } }, [
      svgIcon(GP.ICON[p.gender || 'u'], 32),
      h('div', {}, [h('div', { 'class': 'n' }, fullName(p)), meta ? h('div', { 'class': 'm' }, meta) : null]),
      p.order != null ? h('span', { 'class': 'ord' }, String(p.order)) : null]);
  }
  function anniversaryText(death) {
    var m = /^(\d{1,2})\/(\d{1,2})$/.exec(death || '');
    if (!m) return null;
    var up = GP.lunar.upcoming([{ death: death }], new Date(), 400)[0];
    return up ? 'Lần tới: ' + WD[up.date.getDay()] + ', ' + dmy(up.date) + (up.inDays === 0 ? ' (hôm nay)' : ' (còn ' + up.inDays + ' ngày)') : null;
  }
  function renderPanel() {
    var ix = S.ix, p = ix.byId[S.sel]; if (!p) return;
    var col = GP.colorOf(ix, p.id), ph = GP.phaiOf(ix, p.id), n = GP.splitName(p.name), par = ix.byId[p.parent];
    var mi = GP.motherIndex(ix, p), kids = ix.kids[p.id], sibs = par ? ix.kids[par.id].filter(function (s) { return s.id !== p.id; }) : [];
    panel.style.setProperty('--phc', col);
    var chips = [h('span', { 'class': 'chip' }, 'Đời thứ ' + ix.gen[p.id])];
    if (ph) chips.push(h('span', { 'class': 'chip c', style: 'background:' + col }, 'Phái ' + ph));
    if (p.order != null) chips.push(h('span', { 'class': 'chip' }, 'Ngôi thứ ' + p.order));
    if (mi) chips.push(h('span', { 'class': 'chip c', style: 'background:' + GP.THEME.wife[(mi - 1) % 3] }, 'Con ' + GP.THEME.wifeLabel[mi - 1]));
    var rows = [];
    function row(k, v, small) { if (v) rows.push(h('div', { 'class': 'row' }, [h('div', { 'class': 'k' }, k), h('div', { 'class': 'v' }, [v, small ? h('small', {}, small) : null])])); }
    row('Ngày giỗ', p.death ? p.death + ' (âm lịch)' : '', anniversaryText(p.death));
    row('Nơi an táng', p.grave);
    row('Ghi chú', p.note);
    row('Ký hiệu', p.mark ? '(' + p.mark + ')' : '', p.mark ? 'Chép đúng theo bản gốc 2007' : null);
    if (mi && par.spouses[mi - 1]) row('Mẹ', fullName(par.spouses[mi - 1]));
    var lineage = GP.ancestors(ix, p.id).reverse();
    var body = [
      rows.length ? h('div', { 'class': 'sec' }, rows) : null,
      p.uncertain && p.uncertain.length ? h('div', { 'class': 'warn' }, 'Chữ trong bản gốc bị mờ ở mục: ' + p.uncertain.map(function (f) {
        return { grave: 'nơi an táng', death: 'ngày giỗ', note: 'ghi chú', name: 'tên' }[f] || f; }).join(', ') + '. Nhờ người lớn trong họ xác nhận.') : null,
      (p.spouses || []).length ? h('div', { 'class': 'sec' }, [h('h4', {}, p.gender === 'f' ? 'Chồng' : 'Vợ')].concat(p.spouses.map(function (sp, i) {
        var m = []; if (sp.death) m.push('Giỗ ' + sp.death); if (sp.grave) m.push('Mộ: ' + sp.grave); if (sp.mark) m.push('(' + sp.mark + ')');
        return h('div', { 'class': 'spouse' }, [h('div', { 'class': 'n' }, (p.spouses.length > 1 ? (i + 1) + '. ' : '') + fullName(sp)),
          m.length ? h('div', { 'class': 'm' }, m.join(' · ')) : null, sp.note ? h('div', { 'class': 'm' }, sp.note) : null,
          sp.uncertain ? h('div', { 'class': 'm' }, '⚠ chữ mờ trong bản gốc, cần xác nhận') : null]);
      }))) : null,
      lineage.length ? h('div', { 'class': 'sec' }, [h('h4', {}, 'Dòng dõi từ Thủy tổ'), h('div', { 'class': 'lineage' }, lineage.reduce(function (acc, a, i) {
        if (i) acc.push(h('span', { 'class': 'arrow' }, '›'));
        acc.push(h('button', { type: 'button', onclick: function () { select(a.id, true); } }, a.name.replace(/^Tăng (Văn )?/, '')));
        return acc;
      }, []))]) : null,
      par ? h('div', { 'class': 'sec' }, [h('h4', {}, p.gender === 'f' ? 'Cha' : 'Cha'), personButton(par, 'Đời thứ ' + ix.gen[par.id])]) : null,
      kids.length ? h('div', { 'class': 'sec' }, [h('h4', {}, 'Các con (' + kids.length + ')'), h('div', { 'class': 'plist' }, kids.map(function (c) {
        var cm = GP.motherIndex(ix, c); return personButton(c, cm ? 'Con ' + GP.THEME.wifeLabel[cm - 1] : (ix.kids[c.id].length ? ix.kids[c.id].length + ' người con' : null)); }))]) : null,
      sibs.length ? h('div', { 'class': 'sec' }, [h('h4', {}, 'Anh chị em (' + sibs.length + ')'), h('div', { 'class': 'plist' }, sibs.map(function (c) { return personButton(c); }))]) : null,
      S.edit ? h('div', { 'class': 'actions' }, [
        btn('edit', 'Sửa thông tin', function () { openForm(p.id, null); }, 'primary'),
        btn('plus', 'Thêm con', function () { openForm(null, p.id); }),
        btn('close', 'Xóa người này', function () { confirmDelete(p.id); })]) : null,
    ];
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.appendChild(h('button', { 'class': 'grab', type: 'button', 'aria-label': 'Kéo lên để xem chi tiết' }));
    panel.appendChild(h('div', { 'class': 'ph' }, [
      h('div', { 'class': 'close' }, btn('close', '', closePanel, '', 'Đóng')),
      h('div', { 'class': 'who' }, [svgIcon(GP.ICON[p.gender || 'u'], 64), h('div', {}, [
        h('div', { 'class': 'pn-pre' }, (GP.genderLabel(p.gender) ? GP.genderLabel(p.gender) + ' ' : '') + n.pre),
        h('div', { 'class': 'pn-main' }, n.main)])]),
      h('div', { 'class': 'chips' }, chips)]));
    panel.appendChild(h('div', { 'class': 'pb' }, body));
  }

  /* ---------- search ---------- */
  var hits = [], hitIdx = 0;
  function runSearch() {
    var q = GP.fold(searchInput.value.trim());
    treeG.querySelectorAll('.card.hit').forEach(function (c) { c.classList.remove('hit'); });
    while (results.firstChild) results.removeChild(results.firstChild);
    if (!q) { results.hidden = true; return; }
    var words = q.split(/\s+/);
    hits = S.data.people.filter(function (p) {
      var hay = GP.fold(fullName(p) + ' ' + (p.spouses || []).map(function (s) { return s.name; }).join(' '));
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 40);
    hitIdx = 0;
    hits.forEach(function (p, i) {
      var c = document.getElementById('c-' + p.id); if (c) c.classList.add('hit');
      var par = S.ix.byId[p.parent];
      results.appendChild(h('button', { type: 'button', 'class': i ? '' : 'on', onclick: function () { pick(p.id); } }, [
        svgIcon(GP.ICON[p.gender || 'u'], 30),
        h('div', {}, [h('div', { 'class': 'rn' }, fullName(p)), h('div', { 'class': 'rm' }, 'Đời ' + S.ix.gen[p.id] + (par ? ' · con của ' + par.name : ''))])]));
    });
    if (!hits.length) results.appendChild(h('div', { 'class': 'empty' }, 'Không tìm thấy tên này.'));
    results.hidden = false;
  }
  function pick(id) { results.hidden = true; searchInput.blur(); select(id, true); }
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', function () { if (searchInput.value) runSearch(); });
  searchInput.addEventListener('keydown', function (e) {
    var items = results.querySelectorAll('button');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!items.length) return;
      items[hitIdx] && items[hitIdx].classList.remove('on');
      hitIdx = (hitIdx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[hitIdx].classList.add('on'); items[hitIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && hits[hitIdx]) pick(hits[hitIdx].id);
    else if (e.key === 'Escape') { searchInput.value = ''; runSearch(); searchInput.blur(); }
  });
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest || !e.target.closest('.search')) results.hidden = true; });

  /* ---------- modal ---------- */
  var scrim = null;
  function modal(title, body, footer) {
    closeModal();
    scrim = h('div', { 'class': 'scrim pe', onclick: function (e) { if (e.target === scrim) closeModal(); } }, [
      h('div', { 'class': 'modal', role: 'dialog', 'aria-label': title }, [
        h('div', { 'class': 'mh' }, [h('h3', {}, title), btn('close', '', closeModal, '', 'Đóng')]),
        h('div', { 'class': 'mb' }, body), footer ? h('div', { 'class': 'mf' }, footer) : null])]);
    ui.appendChild(scrim);
    return scrim;
  }
  function closeModal() { if (scrim) { scrim.remove(); scrim = null; } }
  function toast(msg, actions, ms) {
    if (toastEl) toastEl.remove();
    toastEl = h('div', { 'class': 'toast pe', role: 'status' }, [h('span', {}, msg)].concat(actions || []));
    ui.appendChild(toastEl);
    var me = toastEl;
    if (ms !== 0) setTimeout(function () { if (toastEl === me) { me.remove(); toastEl = null; } }, ms || 3200);
  }

  /* ---------- anniversaries ---------- */
  function openAnniversaries() {
    var items = [];
    S.data.people.forEach(function (p) {
      if (p.death) items.push({ id: p.id, who: fullName(p), death: p.death, rel: '' });
      (p.spouses || []).forEach(function (sp) { if (sp.death) items.push({ id: p.id, who: fullName(sp), death: sp.death, rel: (p.gender === 'f' ? 'chồng của ' : 'vợ của ') + p.name }); });
    });
    var today = new Date(), lt = GP.lunar.toLunar(today.getDate(), today.getMonth() + 1, today.getFullYear());
    var list = GP.lunar.upcoming(items, today, 365);
    var m = S.data.meta.anniversary ? /(\d{1,2})\/(\d{1,2})/.exec(S.data.meta.anniversary) : null;
    var chap = m ? GP.lunar.upcoming([{ death: m[1] + '/' + m[2] }], today, 400)[0] : null;
    var body = [h('p', { 'class': 'prose' }, 'Hôm nay: ' + WD[today.getDay()] + ', ' + dmy(today) + ' — âm lịch ' + lt.day + '/' + lt.month +
      (lt.leap ? ' (nhuận)' : '') + ' năm ' + GP.lunar.yearName(lt.year) + '.')];
    if (chap) body.push(h('div', { 'class': 'warn', style: 'background:#fbefd2;color:#5a4520' }, 'Ngày chạp mả (16/3 âm lịch) năm tới: ' + WD[chap.date.getDay()] + ', ' + dmy(chap.date) + ' — còn ' + chap.inDays + ' ngày.'));
    body.push(h('div', { 'class': 'sec' }, [h('h4', {}, 'Ngày giỗ trong 12 tháng tới (' + list.length + ')')].concat(list.map(function (a) {
      return h('div', { 'class': 'list-item', onclick: function () { closeModal(); select(a.item.id, true); } }, [
        h('div', { 'class': 'dateBox' }, [h('div', { 'class': 'd' }, a.date.getDate() + '/' + (a.date.getMonth() + 1)), h('div', { 'class': 'w' }, WD[a.date.getDay()])]),
        h('div', {}, [h('div', { style: 'font-weight:700' }, [a.item.who, a.inDays <= 7 ? h('span', { 'class': 'soon' }, a.inDays ? 'còn ' + a.inDays + ' ngày' : 'hôm nay') : null]),
          h('div', { 'class': 'rm', style: 'font-size:13px;color:#7a6a58' }, 'Giỗ ' + a.lunar + ' âm lịch' + (a.item.rel ? ' · ' + a.item.rel : '') + ' · Đời ' + S.ix.gen[a.item.id])])]);
    }))));
    body.push(h('p', { style: 'font-size:13px;color:#7a6a58' }, 'Ngày dương lịch được đổi tự động từ ngày âm lịch (múi giờ Việt Nam).'));
    modal('Ngày giỗ sắp tới', body);
  }

  /* ---------- about / legend / how-to ---------- */
  function openAbout() {
    var T = GP.THEME, meta = S.data.meta, st = GP.stats(S.ix);
    var body = [
      h('p', {}, h('b', {}, st.people + ' người · ' + st.gens + ' đời · ' + st.phai + ' phái')),
      h('div', { 'class': 'sec' }, [h('h4', {}, 'Cách xem')]),
      h('ol', { 'class': 'howto' }, [
        h('li', {}, 'Chạm (hoặc bấm) vào ô một người để xem ngày giỗ, nơi an táng, vợ/chồng, các con và dòng dõi. Đường nối về Thủy tổ và tới con cháu sẽ sáng lên.'),
        h('li', {}, 'Kéo hoặc lăn chuột để di chuyển. Phóng to, thu nhỏ: chụm hai ngón, giữ Ctrl/⌘ rồi lăn chuột, hoặc nút + / −. Nút ⤢ để xem toàn bộ cây.'),
        h('li', {}, 'Gõ tên vào ô tìm kiếm (không cần dấu, ví dụ "tang van hay").'),
        h('li', {}, 'Nút xoay (góc phải, trên nút +) để đổi cây ngang (mỗi đời một cột — dễ xem trên điện thoại) hoặc cây dọc (mỗi đời một hàng).'),
        h('li', {}, 'Ý nghĩa màu và ký hiệu: bấm "Chú thích" ở góc trái dưới.'),
        h('li', {}, 'Nút "Ngày giỗ" liệt kê các ngày giỗ trong năm, đã đổi sang dương lịch.')]),
      h('div', { 'class': 'sec prose' }, [h('h4', {}, 'Quy ước của bản gốc')].concat((meta.conventions || []).concat(meta.anniversary ? [meta.anniversary] : []).map(function (x) { return h('p', {}, x); }))),
      h('div', { 'class': 'sec credits' }, [h('h4', {}, 'Người làm gia phả')].concat(GP.creditLines(meta).map(function (c) { return h('p', {}, c); }))
        .concat((meta.maintainers || []).filter(function (m) { return m.phone; }).map(function (m) {
          var slot = h('span', {});
          slot.appendChild(btn('', 'Hiện số điện thoại của ' + m.name, function () {
            var num = GP.revealPhone(m.phone);
            while (slot.firstChild) slot.removeChild(slot.firstChild);
            slot.appendChild(h('a', { href: 'tel:' + num.replace(/\s+/g, ''), 'class': 'tel' }, 'Liên hệ cập nhật: ' + m.name + ' · ' + num));
          }));
          return h('p', {}, slot);
        }))),
    ];
    modal('Hướng dẫn', body, [
      btn('print', 'In / lưu PDF', function () { closeModal(); printPoster(); }),
      btn('link', 'Chép đường dẫn', function () { copyLink(); })]);
  }
  /* ---------- "Lời dặn của tộc": formal page of its own ---------- */
  function openTestament() {
    closeModal();
    function sign(role, name, date) {
      return h('div', { 'class': 'tm-sign' }, [h('div', { 'class': 'tm-sign-k' }, role), h('div', { 'class': 'tm-sign-n' }, name || ''),
        date ? h('div', { 'class': 'tm-sign-d' }, 'Ngày ' + date) : null]);
    }
    var meta = S.data.meta, seal = document.createElementNS(SV, 'svg');
    seal.setAttribute('viewBox', '0 0 92 92'); seal.setAttribute('width', 64); seal.setAttribute('height', 64);
    seal.appendChild(svgFrag(GP.seal(92)));
    var cloud = function (flip) {
      var c = document.createElementNS(SV, 'svg');
      c.setAttribute('viewBox', '-2 0 64 30'); c.setAttribute('width', 64); c.setAttribute('height', 30);
      if (flip) c.style.transform = 'scaleX(-1)';
      c.appendChild(svgFrag(GP.cloud())); return c;
    };
    scrim = h('div', { 'class': 'scrim testament-scrim pe', onclick: function (e) { if (e.target === scrim) closeModal(); } }, [
      h('article', { 'class': 'testament', role: 'dialog', 'aria-label': 'Lời dặn của tộc' }, [
        h('div', { 'class': 'tm-close' }, btn('close', '', closeModal, '', 'Đóng')),
        h('div', { 'class': 'tm-frame' }, [
          h('div', { 'class': 'tm-head' }, [seal,
            h('div', { 'class': 'tm-kicker' }, meta.subtitle || ''),
            h('h2', {}, 'Lời dặn của tộc'),
            h('div', { 'class': 'tm-orn' }, [cloud(false), h('span', { 'class': 'tm-dot' }), cloud(true)])]),
          h('div', { 'class': 'tm-body' }, (meta.history || []).map(function (x) { return h('p', {}, x); })),
          meta.anniversary ? h('div', { 'class': 'tm-note' }, [h('div', { 'class': 'tm-note-k' }, 'Ngày chạp mả'), meta.anniversary]) : null,
          h('div', { 'class': 'tm-signs' }, [sign('Người sưu tầm và thiết kế bản gốc', meta.compiler, meta.compiledOn)]
            .concat((meta.maintainers || []).map(function (m) {
              var role = m.role ? 'Người ' + m.role.charAt(0).toLowerCase() + m.role.slice(1) : 'Người cập nhật';
              return sign(role, (GP.genderLabel(m.gender) ? GP.genderLabel(m.gender) + ' ' : '') + m.name, m.date);
            })))])])]);
    ui.appendChild(scrim);
  }
  function copyLink() {
    var url = location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Đã chép đường dẫn.'); }, function () { toast(url, null, 6000); });
    else toast(url, null, 6000);
  }

  /* ---------- print: swap back to the static poster ---------- */
  function showStatic(on) {
    if (!staticG) return;
    if (on) {
      while (staticG.firstChild) staticG.removeChild(staticG.firstChild);
      var st = GP.renderStatic(S.data, S.mode);
      staticG.appendChild(svgFrag(st.svg));
      GP.fitTexts(staticG);
      pageStyle.textContent = '@page { size: ' + (st.width > st.height ? 'landscape' : 'portrait') + '; margin: 8mm; }';
      root.setAttribute('viewBox', '0 0 ' + st.width + ' ' + st.height);
      staticG.removeAttribute('display'); live.setAttribute('display', 'none');
    } else {
      root.removeAttribute('viewBox'); staticG.setAttribute('display', 'none'); live.removeAttribute('display');
      while (staticG.firstChild) staticG.removeChild(staticG.firstChild);
    }
  }
  // printing (button or Ctrl/⌘+P) swaps in the poster of the current view: cây ngang prints portrait, cây dọc landscape
  var pageStyle = isSvgDoc ? document.createElementNS(SV, 'style') : document.createElement('style');
  (isSvgDoc ? root : document.head).appendChild(pageStyle);
  function printPoster() { window.print(); }
  addEventListener('beforeprint', function () { showStatic(true); });
  addEventListener('afterprint', function () { showStatic(false); });

  /* ---------- editing ---------- */
  function setEdit(on) {
    S.edit = on; editBtn.classList.toggle('on', on);
    if (editbar) { editbar.remove(); editbar = null; }
    if (on) {
      editbar = h('div', { 'class': 'editbar pe' }, [
        h('span', { 'class': 'et' }, [S.dirty ? h('span', { 'class': 'dot' }) : null,
          S.dirty ? 'Chưa lưu file' : h('span', {}, ['Đang sửa', h('span', { 'class': 'hide-sm' }, ' — chạm vào một người để sửa')])]),
        S.history.length ? btn('undo', 'Hoàn tác', undo) : null,
        btn('save', 'Lưu file', exportDoc, 'primary', 'Tải về file gia phả đã cập nhật'),
        btn('data', '', exportJson, '', 'Tải dữ liệu JSON')]);
      ui.appendChild(editbar);
    }
    if (S.sel) renderPanel();
  }
  function commit(mutate, msg) {
    S.history.push(JSON.stringify(S.data));
    if (S.history.length > 50) S.history.shift();
    mutate(S.data);
    S.dirty = true;
    store(docKey, JSON.stringify({ at: Date.now(), data: S.data }));
    rebuild(); setEdit(true);
    if (S.sel) { renderPanel(); }
    if (msg) toast(msg);
  }
  function undo() {
    if (!S.history.length) return;
    S.data = JSON.parse(S.history.pop()); S.dirty = !!S.history.length;
    store(docKey, S.dirty ? JSON.stringify({ at: Date.now(), data: S.data }) : null);
    rebuild(); setEdit(true); if (S.sel && S.ix.byId[S.sel]) renderPanel(); else closePanel();
    toast('Đã hoàn tác.');
  }
  function newId() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  function field(label, input, help) { return h('div', { 'class': 'field' }, [h('label', {}, label), input, help ? h('div', { 'class': 'help' }, help) : null]); }
  function genderSelect(v) {
    return h('select', {}, [['m', 'Ông (nam)'], ['f', 'Bà (nữ)'], ['u', 'Chưa rõ']].map(function (o) {
      var op = h('option', { value: o[0] }, o[1]); if ((v || 'u') === o[0]) op.selected = true; return op; }));
  }
  var DEATH_RE = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;
  function cleanDeath(v) { var m = DEATH_RE.exec(v || ''); return m ? (+m[1]) + '/' + (+m[2]) : (v || '').trim(); }
  function validDeath(v) { if (!v.trim()) return true; var m = DEATH_RE.exec(v); return !!m && +m[1] >= 1 && +m[1] <= 30 && +m[2] >= 1 && +m[2] <= 12; }

  /* id: edit this person; parentId: add a new child under that parent */
  function openForm(id, parentId) {
    var p = id ? S.ix.byId[id] : { gender: 'm', name: 'Tăng ', parent: parentId };
    var par = S.ix.byId[p.parent];
    if (!id) {
      var orders = S.ix.kids[parentId].map(function (c) { return c.order || 0; });
      p.order = (orders.length ? Math.max.apply(null, orders) : 0) + 1;
    }
    var f = {
      gender: genderSelect(p.gender), name: h('input', { value: p.name, required: true, autocomplete: 'off' }),
      order: h('input', { type: 'number', min: 1, inputmode: 'numeric', value: p.order == null ? '' : p.order }),
      death: h('input', { value: p.death || '', placeholder: 'ví dụ 8/12', inputmode: 'numeric' }),
      grave: h('input', { value: p.grave || '' }), note: h('textarea', {}, p.note || ''),
      mark: h('input', { value: p.mark || '' }),
      verified: h('input', { type: 'checkbox' }),
    };
    var mother = null;
    if (par && par.spouses && par.spouses.length > 1) {
      mother = h('select', {}, [h('option', { value: '' }, 'Không rõ')].concat(par.spouses.map(function (sp, i) {
        var op = h('option', { value: i + 1 }, (i + 1) + '. ' + fullName(sp)); if (p.mother === i + 1) op.selected = true; return op; })));
    }
    var spWrap = h('div', {}), spRows = [];
    function addSpouse(sp) {
      var r = { gender: genderSelect(sp.gender || (p.gender === 'f' ? 'm' : 'f')), name: h('input', { value: sp.name || '' }),
        death: h('input', { value: sp.death || '', placeholder: 'ví dụ 18/9', inputmode: 'numeric' }), grave: h('input', { value: sp.grave || '' }),
        note: h('input', { value: sp.note || '' }), orig: sp };
      r.box = h('div', { 'class': 'spbox' }, [
        h('div', { 'class': 'sph' }, ['Vợ / chồng', btn('close', 'Bỏ', function () { r.box.remove(); spRows.splice(spRows.indexOf(r), 1); })]),
        h('div', { 'class': 'grid2' }, [field('Danh xưng', r.gender), field('Họ và tên', r.name), field('Ngày giỗ (âm lịch)', r.death), field('Nơi an táng', r.grave)]),
        field('Ghi chú', r.note)]);
      spRows.push(r); spWrap.appendChild(r.box);
    }
    (p.spouses || []).forEach(addSpouse);
    var hasUnc = p.uncertain && p.uncertain.length || (p.spouses || []).some(function (s) { return s.uncertain; });
    var body = [
      h('div', { 'class': 'grid2' }, [field('Danh xưng', f.gender), field('Ngôi thứ (số trong vòng tròn)', f.order, 'Để trống nếu không rõ')]),
      field('Họ và tên', f.name, 'Ghi đầy đủ, ví dụ: Tăng Văn Hay'),
      mother ? field('Là con của bà', mother) : null,
      h('div', { 'class': 'grid2' }, [field('Ngày giỗ (âm lịch)', f.death, 'Ngày/tháng, ví dụ 8/12'), field('Nơi an táng', f.grave)]),
      field('Ghi chú', f.note),
      field('Ký hiệu', f.mark, 'Ví dụ "c" như trong bản gốc; để trống nếu không có'),
      hasUnc ? h('label', { 'class': 'check' }, [f.verified, 'Đã đối chiếu, thông tin trên là chính xác (bỏ cảnh báo chữ mờ)']) : null,
      h('div', { 'class': 'sec' }, [h('h4', {}, 'Vợ / chồng')]), spWrap,
      btn('plus', 'Thêm vợ/chồng', function () { addSpouse({}); }),
    ];
    function save() {
      var bad = false;
      [[f.name, !f.name.value.trim() || f.name.value.trim() === 'Tăng'], [f.death, !validDeath(f.death.value)]].concat(spRows.map(function (r) { return [r.death, !validDeath(r.death.value)]; }))
        .forEach(function (x) { x[0].parentNode.classList.toggle('bad', x[1]); bad = bad || x[1]; });
      if (bad) { toast('Kiểm tra lại các ô tô đỏ: tên không được trống, ngày giỗ ghi dạng ngày/tháng.'); return; }
      var rec = { name: f.name.value.trim().replace(/\s+/g, ' '), gender: f.gender.value };
      ['death', 'grave', 'note', 'mark'].forEach(function (k) { var v = k === 'death' ? cleanDeath(f[k].value) : f[k].value.trim(); if (v) rec[k] = v; });
      if (f.order.value !== '') rec.order = parseInt(f.order.value, 10);
      if (mother && mother.value) rec.mother = parseInt(mother.value, 10);
      var sps = spRows.filter(function (r) { return r.name.value.trim(); }).map(function (r) {
        var s = { name: r.name.value.trim(), gender: r.gender.value };
        ['death', 'grave', 'note'].forEach(function (k) { var v = k === 'death' ? cleanDeath(r[k].value) : r[k].value.trim(); if (v) s[k] = v; });
        if (r.orig.mark) s.mark = r.orig.mark;
        if (r.orig.uncertain && !f.verified.checked) s.uncertain = r.orig.uncertain;
        return s;
      });
      if (sps.length) rec.spouses = sps;
      if (p.uncertain && !f.verified.checked) {
        var keep = p.uncertain.filter(function (k) { return (rec[k] || '') === (p[k] || ''); });
        if (keep.length) rec.uncertain = keep;
      }
      closeModal();
      if (id) {
        commit(function (d) {
          var i = d.people.findIndex(function (x) { return x.id === id; }), old = d.people[i], out = { id: old.id };
          if (old.parent) out.parent = old.parent;
          if (old.phai) out.phai = old.phai;
          d.people[i] = Object.assign(out, rec);
        }, 'Đã lưu thay đổi cho ' + rec.name + '. Nhớ bấm "Lưu file".');
      } else {
        var nid = newId();
        commit(function (d) { d.people.push(Object.assign({ id: nid, parent: parentId }, rec)); }, 'Đã thêm ' + rec.name + '. Nhớ bấm "Lưu file".');
        select(nid, true);
      }
    }
    modal(id ? 'Sửa thông tin' : 'Thêm con cho ' + fullName(S.ix.byId[parentId]), body, [
      btn('', 'Hủy', closeModal), btn('save', id ? 'Lưu thay đổi' : 'Thêm người', save, 'primary')]);
    setTimeout(function () { f.name.focus(); }, 50);
  }
  function confirmDelete(id) {
    var p = S.ix.byId[id];
    if (S.ix.kids[id].length) { toast('Không xóa được: ' + p.name + ' còn ' + S.ix.kids[id].length + ' người con trong cây. Hãy xóa hoặc chuyển các con trước.', null, 5000); return; }
    if (!p.parent) { toast('Không xóa được Thủy tổ.'); return; }
    modal('Xóa người này?', [h('p', { 'class': 'prose' }, 'Xóa ' + fullName(p) + ' khỏi gia phả. Có thể bấm "Hoàn tác" nếu xóa nhầm.')], [
      btn('', 'Hủy', closeModal),
      btn('close', 'Xóa', function () {
        var par = p.parent; closeModal();
        commit(function (d) { d.people = d.people.filter(function (x) { return x.id !== id; }); }, 'Đã xóa ' + p.name + '.');
        select(par, true);
      }, 'primary')]);
  }

  /* ---------- export: the downloaded file is a full copy of this document with the new data ---------- */
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type })), a = h('a', { href: url, download: name });
    ui.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function exportDoc() {
    var data = JSON.parse(JSON.stringify(S.data)), d = new Date();
    data.meta.updated = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    var json = JSON.stringify(data, null, 1).replace(/\]\]>/g, ']]\\u003e');
    var st = GP.renderStatic(data, 'lr');
    var copy = document.documentElement.cloneNode(true);
    var r = isSvgDoc ? copy : copy.querySelector('#gp-root');
    ['#gp-live', '#gp-ui', '#gp-ui-root'].forEach(function (sel) { var el = copy.querySelector(sel); if (el) el.parentNode.removeChild(el); });
    r.removeAttribute('style'); r.removeAttribute('class');
    r.setAttribute('viewBox', '0 0 ' + st.width + ' ' + st.height);
    r.setAttribute('width', st.width); r.setAttribute('height', st.height);
    var sg = copy.querySelector('#gp-static');
    while (sg.firstChild) sg.removeChild(sg.firstChild);
    sg.appendChild(svgFrag(st.svg));
    sg.removeAttribute('display');
    var de = copy.querySelector('#gp-data');
    while (de.firstChild) de.removeChild(de.firstChild);
    de.appendChild(isSvgDoc ? copy.ownerDocument.createCDATASection('\n' + json + '\n') : copy.ownerDocument.createTextNode(json));
    if (!isSvgDoc) { var b = copy.querySelector('body'); if (b) b.removeAttribute('style'); }
    var text = isSvgDoc ? '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy)
      : '<!DOCTYPE html>\n' + copy.outerHTML;
    download('gia-pha-toc-tang-' + stamp() + (isSvgDoc ? '.svg' : '.html'), text, isSvgDoc ? 'image/svg+xml' : 'text/html');
    S.dirty = false; store(docKey, null); setEdit(S.edit);
    toast('Đã tải file mới. Hãy dùng file này thay cho file cũ và gửi cho cả họ.', null, 6000);
  }
  function exportJson() { download('gia-pha-toc-tang-' + stamp() + '.json', JSON.stringify(S.data, null, 1), 'application/json'); }

  function setMode(m) { S.mode = m; store('gp:mode', m); rebuild(); if (S.sel) centerOn(S.sel); else fit(true); }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName ? t.tagName.toUpperCase() : '', typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') { if (scrim) closeModal(); else if (S.sel) closePanel(); return; }
    if (typing || scrim) return;
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.3);
    else if (e.key === '-') zoomBy(1 / 1.3);
    else if (e.key === '0') fit(true);
    else if (S.sel && /^Arrow/.test(e.key)) {
      var p = S.ix.byId[S.sel], sib = p.parent ? S.ix.kids[p.parent] : S.ix.roots, i = sib.indexOf(p), next = null, lr = S.mode === 'lr';
      var up = lr ? 'ArrowLeft' : 'ArrowUp', down = lr ? 'ArrowRight' : 'ArrowDown', prev = lr ? 'ArrowUp' : 'ArrowLeft', fwd = lr ? 'ArrowDown' : 'ArrowRight';
      if (e.key === up) next = S.ix.byId[p.parent];
      else if (e.key === down) next = S.ix.kids[p.id][0];
      else if (e.key === prev) next = sib[i - 1];
      else if (e.key === fwd) next = sib[i + 1];
      if (next) { e.preventDefault(); select(next.id, true); }
    }
  });

  /* ---------- start ---------- */
  rebuild(); fit(false);
  setTimeout(function () { if (!S.sel) fitGenerations(5, true); }, 700);
  window.GPApp = { state: S, select: select, fit: fit, fitGenerations: fitGenerations, setMode: setMode, setEdit: setEdit,
    openForm: openForm, openAnniversaries: openAnniversaries, openAbout: openAbout, openTestament: openTestament, zoomBy: zoomBy };
  var draft = store(docKey);
  if (draft) {
    try {
      var dj = JSON.parse(draft);
      toast('Có bản chỉnh sửa chưa lưu file (' + new Date(dj.at).toLocaleString('vi-VN') + ').', [
        btn('', 'Khôi phục', function () { S.history.push(JSON.stringify(S.data)); S.data = dj.data; S.dirty = true; rebuild(); setEdit(true); toastEl.remove(); toastEl = null; }),
        btn('', 'Bỏ qua', function () { store(docKey, null); toastEl.remove(); toastEl = null; })], 0);
    } catch (e) { store(docKey, null); }
  }
  var start = (location.hash || '').slice(1);
  if (start && S.ix.byId[start]) setTimeout(function () { select(start, true); }, 300);
})();
