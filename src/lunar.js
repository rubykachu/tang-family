/* Vietnamese lunar calendar (astronomical algorithm by Hồ Ngọc Đức, UTC+7).
 * Used to turn a lunar death anniversary ("giỗ 8/12") into this year's solar date. */
var GP = (typeof GP !== 'undefined' && GP) || {};

GP.lunar = (function () {
  var TZ = 7, PI = Math.PI;
  function jdFromDate(dd, mm, yy) {
    var a = Math.floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
    var jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    return jd;
  }
  function jdToDate(jd) {
    var a, b, c;
    if (jd > 2299160) { a = jd + 32044; b = Math.floor((4 * a + 3) / 146097); c = a - Math.floor((b * 146097) / 4); }
    else { b = 0; c = jd + 32082; }
    var d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * d) / 4), m = Math.floor((5 * e + 2) / 153);
    return [e - Math.floor((153 * m + 2) / 5) + 1, m + 3 - 12 * Math.floor(m / 10), b * 100 + d - 4800 + Math.floor(m / 10)];
  }
  function newMoon(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
    var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr) - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr)) - 0.0074 * Math.sin(dr * (M - Mpr));
    C1 = C1 + 0.0004 * Math.sin(dr * (2 * F + M)) - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    var deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - deltat;
  }
  function sunLongitude(jdn) {
    var T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
    var M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    var DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
    var L = (L0 + DL) * dr;
    L -= PI * 2 * Math.floor(L / (PI * 2));
    return L;
  }
  function newMoonDay(k) { return Math.floor(newMoon(k) + 0.5 + TZ / 24); }
  function sunSector(jd) { return Math.floor((sunLongitude(jd - 0.5 - TZ / 24) / PI) * 6); }
  function month11(yy) {
    var off = jdFromDate(31, 12, yy) - 2415021, k = Math.floor(off / 29.530588853), nm = newMoonDay(k);
    if (sunSector(nm) >= 9) nm = newMoonDay(k - 1);
    return nm;
  }
  function leapOffset(a11) {
    var k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5), last, i = 1, arc = sunSector(newMoonDay(k + i));
    do { last = arc; i++; arc = sunSector(newMoonDay(k + i)); } while (arc !== last && i < 14);
    return i - 1;
  }
  /* solar (d, m, y) -> { day, month, year, leap } */
  function toLunar(dd, mm, yy) {
    var dayNumber = jdFromDate(dd, mm, yy), k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    var monthStart = newMoonDay(k + 1);
    if (monthStart > dayNumber) monthStart = newMoonDay(k);
    var a11 = month11(yy), b11 = a11, lunarYear;
    if (a11 >= monthStart) { lunarYear = yy; a11 = month11(yy - 1); } else { lunarYear = yy + 1; b11 = month11(yy + 1); }
    var day = dayNumber - monthStart + 1, diff = Math.floor((monthStart - a11) / 29), leap = false, month = diff + 11;
    if (b11 - a11 > 365) {
      var lm = leapOffset(a11);
      if (diff >= lm) { month = diff + 10; if (diff === lm) leap = true; }
    }
    if (month > 12) month -= 12;
    if (month >= 11 && diff < 4) lunarYear -= 1;
    return { day: day, month: month, year: lunarYear, leap: leap };
  }
  /* lunar (d, m, lunarYear) -> Date (local midnight) in the non-leap month */
  function toSolar(ld, lm, ly) {
    var a11, b11;
    if (lm < 11) { a11 = month11(ly - 1); b11 = month11(ly); } else { a11 = month11(ly); b11 = month11(ly + 1); }
    var k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853), off = lm - 11;
    if (off < 0) off += 12;
    if (b11 - a11 > 365) { var lo = leapOffset(a11); if (off >= lo) off += 1; }
    var start = newMoonDay(k + off), r = jdToDate(start + ld - 1);
    return new Date(r[2], r[1] - 1, r[0]);
  }
  var CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
  var CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
  function yearName(y) { return CAN[(y + 6) % 10] + ' ' + CHI[(y + 8) % 12]; }

  /* Next solar occurrences (from `from`, within `days`) of each "d/m" lunar anniversary. */
  function upcoming(items, from, days) {
    var t0 = new Date(from.getFullYear(), from.getMonth(), from.getDate()), now = toLunar(t0.getDate(), t0.getMonth() + 1, t0.getFullYear());
    var out = [];
    items.forEach(function (it) {
      var m = /^(\d{1,2})\/(\d{1,2})$/.exec((it.death || '').trim());
      if (!m) return;
      var d = +m[1], mo = +m[2];
      [now.year, now.year + 1].forEach(function (ly) {
        var dt = toSolar(d, mo, ly), diff = Math.round((dt - t0) / 864e5);
        if (diff >= 0 && diff <= days) out.push({ item: it, date: dt, inDays: diff, lunar: d + '/' + mo, lunarYear: ly });
      });
    });
    return out.sort(function (a, b) { return a.date - b.date; });
  }
  return { toLunar: toLunar, toSolar: toSolar, yearName: yearName, upcoming: upcoming };
})();

if (typeof module !== 'undefined') module.exports = GP.lunar;
