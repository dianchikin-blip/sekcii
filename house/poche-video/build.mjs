// Генерирует compositions/poche.html — поше-план — СТРОГО из ../plan.json.
// Запуск: node build.mjs
import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
const W = 1080, HH = 1920;
const S = 72, PX0 = 88, PY0 = 330 + 13.3 * S;
const X = (x) => PX0 + x * S, Y = (y) => PY0 - y * S;
const f = (n) => n.toFixed(1);
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");
const pts = (poly) => poly.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(" ");
const wallById = Object.fromEntries(plan.walls.map((w) => [w.id, w]));
const roomById = Object.fromEntries(plan.rooms.map((r) => [r.id, r]));

const wallBox = (w) => {
  const t = w.thickness / 2, hz = Math.abs(w.a[1] - w.b[1]) < 1e-9;
  return { hz, x0: Math.min(w.a[0], w.b[0]) - (hz ? 0 : t), x1: Math.max(w.a[0], w.b[0]) + (hz ? 0 : t),
    y0: Math.min(w.a[1], w.b[1]) - (hz ? t : 0), y1: Math.max(w.a[1], w.b[1]) + (hz ? t : 0) };
};
const boxPath = (b) => `M ${f(X(b.x0))} ${f(Y(b.y0))} H ${f(X(b.x1))} V ${f(Y(b.y1))} H ${f(X(b.x0))} Z`;

// порядок заливки: наружные по кругу, затем несущие, затем перегородки
const kindOrder = { external: 0, internal_bearing: 1, partition: 2 };
const walls = plan.walls.map((w, i) => ({ w, i, b: wallBox(w) }))
  .sort((p, q) => kindOrder[p.w.kind] - kindOrder[q.w.kind] || p.i - q.i);

const contours = walls.map(({ b }) => `<path d="${boxPath(b)}" fill="none" stroke="#A39B8F" stroke-width="1.2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`);
const fills = walls.map(({ w, b }, k) =>
  `<rect id="pw-${k}" class="pw" data-hz="${b.hz ? 1 : 0}" x="${f(X(b.x0))}" y="${f(Y(b.y1))}" width="${f((b.x1 - b.x0) * S)}" height="${f((b.y1 - b.y0) * S)}" fill="#121212"/>`);
for (const c of plan.columns) {
  const xs = c.polygon.map((p) => p[0]), ys = c.polygon.map((p) => p[1]);
  const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  contours.push(`<path d="${boxPath(b)}" fill="none" stroke="#A39B8F" stroke-width="1.2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`);
  fills.push(`<rect id="pw-${fills.length}" class="pw" data-hz="0" x="${f(X(b.x0))}" y="${f(Y(b.y1))}" width="${f((b.x1 - b.x0) * S)}" height="${f((b.y1 - b.y0) * S)}" fill="#121212"/>`);
}

// проёмы: окна — светлые с тонким остеклением, двери — тонкие дуги
const openingsSvg = [], doorsSvg = [];
for (const o of plan.openings) {
  const w = wallById[o.wall.split("/")[0]];
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9, t = w.thickness / 2 + 0.01;
  const c = hz ? w.a[1] : w.a[0];
  const x0 = hz ? Math.min(o.a[0], o.b[0]) : c - t, x1 = hz ? Math.max(o.a[0], o.b[0]) : c + t;
  const y0 = hz ? c - t : Math.min(o.a[1], o.b[1]), y1 = hz ? c + t : Math.max(o.a[1], o.b[1]);
  openingsSvg.push(`<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="#FFFFFF"/>`);
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  if (isWin) {
    for (const k of [-0.05, 0.05]) {
      openingsSvg.push(hz
        ? `<line x1="${f(X(x0))}" y1="${f(Y(c + k))}" x2="${f(X(x1))}" y2="${f(Y(c + k))}" stroke="#8C857B" stroke-width="1"/>`
        : `<line x1="${f(X(c + k))}" y1="${f(Y(y0))}" x2="${f(X(c + k))}" y2="${f(Y(y1))}" stroke="#8C857B" stroke-width="1"/>`);
    }
    // откосы
    openingsSvg.push(hz
      ? `<path d="M ${f(X(x0))} ${f(Y(y0))} V ${f(Y(y1))} M ${f(X(x1))} ${f(Y(y0))} V ${f(Y(y1))}" stroke="#121212" stroke-width="1"/>`
      : `<path d="M ${f(X(x0))} ${f(Y(y0))} H ${f(X(x1))} M ${f(X(x0))} ${f(Y(y1))} H ${f(X(x1))}" stroke="#121212" stroke-width="1"/>`);
    continue;
  }
  const leaves = o.leaves || (o.hinge ? [{ hinge: o.hinge, width: o.width }] : []);
  let side;
  if (o.opens_into === "outside") side = hz ? [0, 1] : [1, 0];
  else if (o.opens_into) {
    const poly = roomById[o.opens_into].polygon;
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    side = hz ? [0, cy > c ? 1 : -1] : [cx > c ? 1 : -1, 0];
  }
  const mid = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
  for (const lf of leaves) {
    const [hx, hy] = hz ? [lf.hinge[0], c + side[1] * t] : [c + side[0] * t, lf.hinge[1]];
    const al = hz ? [mid[0] > hx ? 1 : -1, 0] : [0, mid[1] > hy ? 1 : -1];
    const r = lf.width;
    const closed = [hx + al[0] * r, hy + al[1] * r], open = [hx + side[0] * r, hy + side[1] * r];
    const cross = al[0] * side[1] - al[1] * side[0];
    doorsSvg.push(`<path d="M ${f(X(hx))} ${f(Y(hy))} L ${f(X(open[0]))} ${f(Y(open[1]))} A ${f(r * S)} ${f(r * S)} 0 0 ${cross > 0 ? 1 : 0} ${f(X(closed[0]))} ${f(Y(closed[1]))}" fill="none" stroke="#3A3530" stroke-width="1.1" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`);
  }
}

// ---------- штамп ----------
const SB = { x: 456, y: PY0 + 120, w: 568, h: 330 };
const scaleLen = 5; // м
const sbx = SB.x + 28, sby = SB.y + 238;
const scaleBar = [];
for (let i = 0; i < scaleLen; i++) {
  scaleBar.push(`<rect x="${f(sbx + i * S)}" y="${sby}" width="${S}" height="10" fill="${i % 2 ? "#FFFFFF" : "#121212"}" stroke="#121212" stroke-width="1"/>`);
}
for (const m of [0, 1, 2, 3, 4, 5]) scaleBar.push(`<text x="${f(sbx + m * S)}" y="${sby + 34}" font-size="15" text-anchor="middle" fill="#23201C">${m}</text>`);
scaleBar.push(`<text x="${f(sbx + scaleLen * S + 14)}" y="${sby + 10}" font-size="15" fill="#23201C">м</text>`);
const nx = SB.x + SB.w - 74, ny = SB.y + 196;
const north = `<g>
  <circle cx="${nx}" cy="${ny}" r="40" fill="none" stroke="#121212" stroke-width="1.4"/>
  <path d="M ${nx} ${ny - 36} L ${nx + 13} ${ny + 18} L ${nx} ${ny + 8} Z" fill="#121212"/>
  <path d="M ${nx} ${ny - 36} L ${nx - 13} ${ny + 18} L ${nx} ${ny + 8} Z" fill="#FFFFFF" stroke="#121212" stroke-width="1.2"/>
  <text x="${nx}" y="${ny - 48}" font-size="20" font-weight="700" text-anchor="middle" fill="#121212">С</text>
  <text x="${nx}" y="${ny + 64}" font-size="13" font-weight="700" text-anchor="middle" fill="#9A4322">УСЛОВНО</text>
</g>`;
const stamp = `<g id="pc-stamp">
  <rect x="${SB.x}" y="${SB.y}" width="${SB.w}" height="${SB.h}" fill="#FFFFFF" stroke="#121212" stroke-width="2"/>
  <line x1="${SB.x}" y1="${SB.y + 118}" x2="${SB.x + SB.w}" y2="${SB.y + 118}" stroke="#121212" stroke-width="1"/>
  <line x1="${nx - 64}" y1="${SB.y + 118}" x2="${nx - 64}" y2="${SB.y + SB.h}" stroke="#121212" stroke-width="1"/>
  <text x="${SB.x + 28}" y="${SB.y + 44}" font-size="15" font-weight="700" letter-spacing="2" fill="#8A6230">06-2018-АС · ЛИСТ 14</text>
  <text x="${SB.x + 28}" y="${SB.y + 84}" font-size="30" font-weight="700" fill="#121212">Дом в Шигали</text>
  <text x="${SB.x + 28}" y="${SB.y + 106}" font-size="16" fill="#5E574E">ул. Интересная, 10 · Высокогорский р-н, РТ</text>
  <text x="${SB.x + 28}" y="${SB.y + 152}" font-size="21" font-weight="700" fill="#121212">План первого этажа · поше</text>
  <text x="${SB.x + 28}" y="${SB.y + 180}" font-size="16" fill="#5E574E">${fmt(plan.area_summary.total_table_stated)} м² по экспликации · ${plan.rooms.length} помещений</text>
  <text x="${SB.x + 28}" y="${SB.y + 216}" font-size="15" fill="#5E574E">Масштаб графический</text>
  ${scaleBar.join("\n")}
  ${north}
</g>`;

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #121212; }
    #pc-svg { position: absolute; inset: 0; }
    #pc-head { position: absolute; left: 64px; right: 64px; top: 84px; }
    #pc-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #8A6230; }
    #pc-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #pc-head .d { font-size: 23px; color: #5E574E; margin-top: 12px; }
    #pc-note { position: absolute; left: 64px; width: 360px; top: ${PY0 + 128}px; font-size: 18px; line-height: 1.5; color: #5E574E; }
    #pc-note b { color: #121212; }
    #pc-note .c { color: #9A4322; font-weight: 700; }
  </style>
  <div id="root" data-composition-id="poche" data-width="1080" data-height="1920">
    <svg id="pc-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      <defs>
        <pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.05" fill="#B9B1A4"/></pattern>
      </defs>
      <rect width="${W}" height="${HH}" fill="url(#dots)"/>
      <g id="pc-inside"><polygon points="${pts(plan.outline.polygon)}" fill="#FFFFFF"/></g>
      <g id="pc-porch"><polygon points="${pts(roomById.R8.polygon)}" fill="none" stroke="#A39B8F" stroke-width="1.2" stroke-dasharray="5 4"/></g>
      <g id="pc-contours">${contours.join("\n")}</g>
      <g id="pc-fills">${fills.join("\n")}</g>
      <g id="pc-open">${openingsSvg.join("\n")}</g>
      <g id="pc-doors">${doorsSvg.join("\n")}</g>
      ${stamp}
    </svg>
    <div id="pc-head">
      <div class="k">ШИГАЛИ · ДОМ 06-2018-АС</div>
      <div class="t">Поше-план</div>
      <div class="d">Стены — чёрным, проёмы — светлые, двери — дуги</div>
    </div>
    <div id="pc-note"><b>${plan.walls.length} стен</b> и колонна крыльца, ${plan.openings.filter((o) => o.type === "window" || o.type === "fixed_glazing").length} окон, ${plan.openings.filter((o) => /door/.test(o.type)).length} дверей.<br>Пунктир — крыльцо.<br><span class="c">Условно:</span> север, ширины дверей по масштабу.</div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#pc-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.fromTo("#pc-inside", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, 0.05);
      tl.fromTo("#pc-porch", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.3);
      tl.fromTo("#pc-contours path", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.4, ease: "power1.inOut", stagger: 0.012 }, 0.1);
      const pw = document.querySelectorAll("#pc-fills .pw");
      const step = 1.45 / pw.length;
      pw.forEach((el, i) => {
        const hz = el.dataset.hz === "1";
        tl.fromTo(el, hz ? { scaleX: 0, transformOrigin: "0% 50%" } : { scaleY: 0, transformOrigin: "50% 100%" },
          hz ? { scaleX: 1, duration: 0.2, ease: "power2.out" } : { scaleY: 1, duration: 0.2, ease: "power2.out" }, 0.7 + i * step);
      });
      tl.fromTo("#pc-doors path", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.35, ease: "power1.out", stagger: 0.03 }, 2.0);
      tl.fromTo("#pc-stamp", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 2.25);
      tl.fromTo("#pc-note", { opacity: 0 }, { opacity: 1, duration: 0.35 }, 2.4);
      window.__timelines = window.__timelines || {};
      window.__timelines["poche"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/poche.html", import.meta.url), html);
console.log("walls:", fills.length, "openings:", plan.openings.length, "doors arcs:", doorsSvg.length);
