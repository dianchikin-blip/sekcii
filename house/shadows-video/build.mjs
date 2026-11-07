// Генерирует compositions/shadows.html — этюд теней — СТРОГО из ../plan.json.
// Положение солнца — алгоритм NOAA (Spencer/Meeus), без атмосферной рефракции для теней;
// закат/восход — со стандартной поправкой −0,833°.
import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
// Аудитория: AUDIENCE=client node build.mjs — чистая версия для клиента (без технических отметок)
const CLIENT = (process.env.AUDIENCE || plan.audience || "architect") === "client";
const KICKER = CLIENT ? (plan.meta.client_kicker || plan.meta.title.toUpperCase()) : plan.meta.kicker;
const SS = plan.shadow_study;
const LAT = plan.site.latitude, LON = plan.site.longitude, TZ = SS.tz_hours;
const [YY, MM, DD] = SS.date.split("-").map(Number);
const HWALL = SS.wall_height;
const [H0, H1] = SS.hours;

// ---------- солнце (общая функция: сборка и рантайм) ----------
function sun(lat, lon, tz, Y, M, D, hourLocal) {
  const rad = Math.PI / 180;
  const a = Math.floor((14 - M) / 12), y = Y + 4800 - a, m = M + 12 * a - 3;
  const JDN = D + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const JD = JDN - 0.5 + (hourLocal - tz) / 24;
  const T = (JD - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const Mg = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(Mg * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mg * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mg * rad) * 0.000289;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad)) / rad;
  const yv = Math.tan((eps / 2) * rad) ** 2;
  const eqt = 4 / rad * (yv * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(Mg * rad) + 4 * e * yv * Math.sin(Mg * rad) * Math.cos(2 * L0 * rad)
    - 0.5 * yv * yv * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * Mg * rad));
  const tst = (((hourLocal * 60 + eqt + 4 * lon - 60 * tz) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cz = Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz))) / rad;
  const alt = 90 - zen;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * rad) * Math.cos(zen * rad) - Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.sin(zen * rad))))) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  const haSet = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl * rad)) - Math.tan(lat * rad) * Math.tan(decl * rad)) / rad;
  const noon = 720 - 4 * lon - eqt + tz * 60;
  return { alt, az, sunrise: noon - 4 * haSet, sunset: noon + 4 * haSet, noon };
}

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const DATE_RU = `${DD} ${MONTHS[MM - 1]}`;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const fmt = (n, d = 1) => n.toFixed(d).replace(".", ",");
const shadowLen = (alt) => HWALL / Math.tan((alt * Math.PI) / 180);
const day = sun(LAT, LON, TZ, YY, MM, DD, 12);
const rows = [];
for (let h = H0; h <= H1; h++) { const s = sun(LAT, LON, TZ, YY, MM, DD, h); rows.push({ h, ...s, L: shadowLen(s.alt) }); }

// ---------- геометрия и экран ----------
const W = 1080, HH = 1920;
const out = plan.outline.polygon;
const S = 38;
// окно кадра: дом + максимальная тень в часы этюда
const offs = rows.map((r) => [-r.L * Math.sin((r.az * Math.PI) / 180), -r.L * Math.cos((r.az * Math.PI) / 180)]);
const xs = out.flatMap((p) => [p[0], ...offs.map((o) => p[0] + o[0])]), ys = out.flatMap((p) => [p[1], ...offs.map((o) => p[1] + o[1])]);
const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
const PX0 = W / 2 - ((bx0 + bx1) / 2) * S, PY0 = 300 + by1 * S;
const X = (x) => PX0 + x * S, Y = (y) => PY0 - y * S;
const f = (n) => n.toFixed(1);
const pts = (poly) => poly.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(" ");
const roomById = Object.fromEntries(plan.rooms.map((r) => [r.id, r]));

// тень призмы: смещённый контур + параллелограммы по каждому ребру
function shadowPolys(v) {
  const polys = [out.map((p) => [p[0] + v[0], p[1] + v[1]])];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    polys.push([a, b, [b[0] + v[0], b[1] + v[1]], [a[0] + v[0], a[1] + v[1]]]);
  }
  return polys;
}
const FREEZE = { 8: { col: "#C76A2B", ink: "#8C4413" }, 12: { col: "#3E7CB1", ink: "#23557F" }, 18: { col: "#7B4FA6", ink: "#56337A" } };
const frozen = SS.freeze.map((h) => {
  const s = sun(LAT, LON, TZ, YY, MM, DD, h), L = shadowLen(s.alt);
  const v = [-L * Math.sin((s.az * Math.PI) / 180), -L * Math.cos((s.az * Math.PI) / 180)];
  const c = FREEZE[h] || { col: "#555", ink: "#333" };
  const polys = shadowPolys(v).map((p) => `<polygon points="${pts(p)}"/>`).join("");
  // подпись на конце тени: точка = центр смещённого контура
  const cx = out.reduce((a, p) => a + p[0], 0) / out.length + v[0], cy = out.reduce((a, p) => a + p[1], 0) / out.length + v[1];
  return { h, s, L, v, c, svg: `<g id="fz-${h}" fill="${c.col}" opacity="0.36">${polys}</g>`, cx, cy };
});
// подписи застывших теней — в свободных местах у края тени
const tagFor = (fz, i) => {
  const cw = 300, gap = (W - 128 - 3 * cw) / 2;
  const tx = 64 + i * (cw + gap) + cw / 2, ty = CY + 50;
  const sx = X(fz.cx), sy = Y(fz.cy);
  return `<g id="fzt-${fz.h}">
    <rect x="${f(tx - cw / 2)}" y="${f(ty - 50)}" width="${cw}" height="96" rx="10" fill="#FFFFFF" stroke="${fz.c.col}" stroke-width="2"/>
    <rect x="${f(tx - cw / 2)}" y="${f(ty - 50)}" width="10" height="96" fill="${fz.c.col}" fill-opacity="0.55"/>
    <text x="${f(tx)}" y="${f(ty - 16)}" font-size="28" font-weight="700" text-anchor="middle" fill="${fz.c.ink}">${String(fz.h).padStart(2, "0")}:00</text>
    <text x="${f(tx)}" y="${f(ty + 10)}" font-size="17" text-anchor="middle" fill="#2A2724">высота солнца ${fmt(fz.s.alt)}°${CLIENT ? "" : ` · азимут ${fmt(fz.s.az, 0)}°`}</text>
    <text x="${f(tx)}" y="${f(ty + 33)}" font-size="17" font-weight="700" text-anchor="middle" fill="#2A2724">тень ${fmt(fz.L, 2)} м</text>
  </g>`;
};

// план дома (упрощённо: комнаты + стены светлым)
const plate = [];
plate.push(`<polygon points="${pts(out)}" fill="#FFFFFF" stroke="#2A2724" stroke-width="2.5"/>`);
for (const r of plan.rooms) if (r.id !== "R8") plate.push(`<polygon points="${pts(r.polygon)}" fill="#FBFAF7" stroke="#C9C4BB" stroke-width="1"/>`);
plate.push(`<polygon points="${pts(roomById.R8 ? roomById.R8.polygon : [])}" fill="none" stroke="#9A9184" stroke-width="1" stroke-dasharray="4 3"/>`);
const lp = plan.render_hints?.label_points?.shadows || {};
const centroid = (poly) => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
for (const r of plan.rooms) {
  if (r.area_table < 10) continue;
  const [cx, cy] = lp[r.id] || centroid(r.polygon);
  plate.push(`<text x="${f(X(cx))}" y="${f(Y(cy) + 5)}" font-size="13" text-anchor="middle" fill="#5E574E">${r.name.split(" (")[0]}</text>`);
}
// стрелка севера
const NX = 84, NY = 296;
const north = `<g><path d="M ${NX} ${NY - 34} L ${NX + 12} ${NY + 14} L ${NX} ${NY + 6} Z" fill="#2A2724"/><path d="M ${NX} ${NY - 34} L ${NX - 12} ${NY + 14} L ${NX} ${NY + 6} Z" fill="#FFFFFF" stroke="#2A2724"/>
  <text x="${NX}" y="${NY - 42}" font-size="18" font-weight="700" text-anchor="middle" fill="#2A2724">С</text>
  ${CLIENT ? "" : `<text x="${NX}" y="${NY + 34}" font-size="12" font-weight="700" text-anchor="middle" fill="#9A4322">УСЛОВНО</text>`}</g>`;

// таблица
const tableRows = rows.map((r) => {
  const fz = SS.freeze.includes(r.h) ? FREEZE[r.h] : null;
  return `<div class="tr" id="row-${r.h}"><span>${fz ? `<i style="background:${fz.col}"></i>` : "<i></i>"}${String(r.h).padStart(2, "0")}:00</span><span>${fmt(r.alt)}°</span>${CLIENT ? "" : `<span>${fmt(r.az, 0)}°</span>`}<span>${fmt(r.L, 2)} м</span></div>`;
}).join("");
const CY = Y(by0) + 40, TY = CY + 150;

const T0 = 0.25, T1 = 2.75; // время 8:00→18:00 бежит в этом окне
const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #2A2724; }
    #sh-svg { position: absolute; inset: 0; }
    #sh-head { position: absolute; left: 64px; right: 64px; top: 84px; }
    #sh-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #8A6230; }
    #sh-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #sh-head .d { font-size: 22px; color: #5E574E; margin-top: 12px; }
    #sh-clock { position: absolute; right: 64px; top: 92px; text-align: right; }
    #sh-clock .tm { font-size: 72px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    #sh-clock .sv { font-size: 19px; color: #5E574E; font-variant-numeric: tabular-nums; }
    #sh-table { position: absolute; left: 64px; right: 64px; top: ${f(TY)}px; }
    .th, .tr { display: grid; grid-template-columns: 1.1fr 1fr 1fr 1fr; font-size: 19px; padding: 5px 10px; border-bottom: 1px solid #DDD6CA; font-variant-numeric: tabular-nums; }
    .th { font-weight: 700; font-size: 16px; color: #5E574E; border-bottom: 2px solid #2A2724; }
    .tr span:not(:first-child), .th span:not(:first-child) { text-align: right; }
    .tr i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 10px; vertical-align: 0; }
    .tr.on { background: #FFFFFF; font-weight: 700; }
    #sh-foot { position: absolute; left: 64px; right: 64px; bottom: 64px; border-top: 2px solid #2A2724; padding-top: 14px; display: flex; justify-content: space-between; align-items: baseline; }
    #sh-foot .c { font-size: 30px; font-weight: 700; }
    #sh-foot .s { font-size: 20px; color: #5E574E; text-align: right; }
    #sh-foot .s b { color: #2A2724; font-size: 26px; }
    #sh-note { position: absolute; left: 64px; right: 64px; bottom: 150px; font-size: 16px; color: #5E574E; line-height: 1.45; }
    #sh-note b { color: #9A4322; }
    ${CLIENT ? "#sh-note { display: none; } .th, .tr { grid-template-columns: 1.1fr 1fr 1fr; }" : ""}
  </style>
  <div id="root" data-composition-id="shadows" data-width="1080" data-height="1920">
    <svg id="sh-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      <g id="sh-frozen">${frozen.map((z) => z.svg).join("")}</g>
      <g id="sh-live" fill="#2A2724" opacity="0.42">${shadowPolys([0, 0]).map(() => `<polygon points=""/>`).join("")}</g>
      <g id="sh-plan">${plate.join("\n")}</g>
      <g id="sh-tags">${frozen.map(tagFor).join("")}</g>
      ${north}
    </svg>
    <div id="sh-head">
      <div class="k">${KICKER}</div>
      <div class="t">${CLIENT ? "Солнце и тени" : "Этюд теней"}</div>
      <div class="d">${CLIENT ? `Как солнце обходит дом · ${DATE_RU}` : `Стены ${fmt(HWALL, 2)} м <span style="color:#9A4322;font-weight:700">условно</span>`} · ${String(H0).padStart(2, "0")}:00–${H1}:00</div>
    </div>
    <div id="sh-clock"><div class="tm" id="sh-time">${String(H0).padStart(2, "0")}:00</div><div class="sv" id="sh-sv">—</div></div>
    <div id="sh-table"><div class="th"><span>Время</span><span>Высота солнца</span>${CLIENT ? "" : "<span>Азимут</span>"}<span>Длина тени</span></div>${tableRows}</div>
    <div id="sh-note"><b>Условно:</b> высота стен ${fmt(HWALL, 2)} м, крыша и свесы не учтены, север ≈ верх листа, координаты города. Тень = ${fmt(HWALL, 2)} / tg(высоты солнца).</div>
    <div id="sh-foot"><div class="c">${plan.site.city}, ${DATE_RU} ${YY}</div><div class="s">восход ${hhmm(day.sunrise)} · полдень ${hhmm(day.noon)}<br>закат <b>${hhmm(day.sunset)}</b> ${SS.tz_name}</div></div>
  </div>
  <script>
    (function () {
      ${sun.toString()}
      const LAT = ${LAT}, LON = ${LON}, TZ = ${TZ}, Y = ${YY}, M = ${MM}, D = ${DD}, HW = ${HWALL}, H0 = ${H0}, H1 = ${H1};
      const T0 = ${T0}, T1 = ${T1};
      const OUT = ${JSON.stringify(out)};
      const S = ${S}, PX0 = ${PX0}, PY0 = ${PY0};
      const X = (x) => PX0 + x * S, Yp = (y) => PY0 - y * S;
      const pts = (poly) => poly.map((p) => X(p[0]).toFixed(1) + "," + Yp(p[1]).toFixed(1)).join(" ");
      const live = document.querySelectorAll("#sh-live polygon");
      const tEl = document.getElementById("sh-time"), svEl = document.getElementById("sh-sv");
      const rowsEl = {}; for (let h = H0; h <= H1; h++) rowsEl[h] = document.getElementById("row-" + h);
      const fmt = (n, d) => n.toFixed(d).replace(".", ",");
      const tl = gsap.timeline({ paused: true });
      function paint() {
        const t = tl.time();
        const p = Math.min(1, Math.max(0, (t - T0) / (T1 - T0)));
        const hour = H0 + (H1 - H0) * p;
        const s = sun(LAT, LON, TZ, Y, M, D, hour);
        const L = HW / Math.tan(s.alt * Math.PI / 180);
        const v = [-L * Math.sin(s.az * Math.PI / 180), -L * Math.cos(s.az * Math.PI / 180)];
        live[0].setAttribute("points", pts(OUT.map((q) => [q[0] + v[0], q[1] + v[1]])));
        for (let i = 0; i < OUT.length; i++) {
          const a = OUT[i], b = OUT[(i + 1) % OUT.length];
          live[i + 1].setAttribute("points", pts([a, b, [b[0] + v[0], b[1] + v[1]], [a[0] + v[0], a[1] + v[1]]]));
        }
        const mins = Math.round(hour * 60);
        tEl.textContent = String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
        svEl.textContent = "высота " + fmt(s.alt, 1) + "°" + (${CLIENT} ? "" : " · азимут " + fmt(s.az, 0) + "°") + " · тень " + fmt(L, 2) + " м";
        const cur = Math.min(H1, Math.floor(hour + 1e-6));
        for (const h in rowsEl) rowsEl[h].classList.toggle("on", +h === cur);
      }
      tl.fromTo("#sh-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0);
      tl.fromTo(["#sh-plan", "#sh-table", "#sh-foot"], { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power1.out" }, 0);
      const clock = { v: 0 };
      tl.fromTo(clock, { v: 0 }, { v: 1, duration: 3, ease: "none", onUpdate: paint }, 0);
      const FZ = ${JSON.stringify(SS.freeze)};
      for (const h of FZ) {
        const at = T0 + (T1 - T0) * (h - H0) / (H1 - H0);
        tl.fromTo("#fz-" + h, { opacity: 0 }, { opacity: 0.36, duration: 0.12, ease: "power1.out" }, Math.min(at, 2.86));
        tl.fromTo("#fzt-" + h, { opacity: 0, scale: 0.85, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.18, ease: "back.out(2)" }, Math.min(at + 0.02, 2.8));
      }
      tl.fromTo("#sh-note", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.5);
      window.__timelines = window.__timelines || {};
      window.__timelines["shadows"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/shadows.html", import.meta.url), html);
console.log(rows.map((r) => `${r.h}:00 alt ${r.alt.toFixed(1)} az ${r.az.toFixed(0)} L ${r.L.toFixed(2)}`).join("\n"));
console.log("sunrise", hhmm(day.sunrise), "noon", hhmm(day.noon), "sunset", hhmm(day.sunset), "bbox", bx0.toFixed(1), bx1.toFixed(1), by0.toFixed(1), by1.toFixed(1), "TY", TY.toFixed(0));
