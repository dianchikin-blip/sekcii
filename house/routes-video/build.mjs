// Генерирует compositions/routes.html — схему маршрутов по дому — СТРОГО из ../plan.json.
// Запуск: node build.mjs
import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
const W = 1080, HH = 1920;
const S = 66, PX0 = 126, PY0 = 300 + 13.3 * S;
const X = (x) => PX0 + x * S, Y = (y) => PY0 - y * S;
const f = (n) => n.toFixed(1);
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");
const pts = (poly) => poly.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(" ");

const wallById = Object.fromEntries(plan.walls.map((w) => [w.id, w]));
const openById = Object.fromEntries(plan.openings.map((o) => [o.id, o]));
const roomById = Object.fromEntries(plan.rooms.map((r) => [r.id, r]));
const zoneById = Object.fromEntries(plan.zones.map((z) => [z.id, z]));
const centroid = (poly) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const doorGeom = (o) => {
  const w = wallById[o.wall.split("/")[0]];
  const horiz = Math.abs(o.a[1] - o.b[1]) < 1e-9;
  const c = horiz ? [(o.a[0] + o.b[0]) / 2, w.a[1]] : [w.a[0], (o.a[1] + o.b[1]) / 2];
  return { c, horiz, t: w.thickness };
};

// ---------- маршруты: точки → полилиния через центры дверей ----------
const APPROACH = 0.55; // м — подход перпендикулярно двери
const routes = plan.routes.map((r) => {
  const P = [];
  const doors = [];
  const resolve = (wp) => wp.room ? centroid(roomById[wp.room].polygon) : wp.zone ? zoneById[wp.zone].point : wp.pt;
  for (let i = 0; i < r.waypoints.length; i++) {
    const wp = r.waypoints[i];
    if (!wp.door) { P.push(resolve(wp)); continue; }
    const g = doorGeom(openById[wp.door]);
    const prev = P[P.length - 1];
    const sgn = g.horiz ? (prev[1] < g.c[1] ? -1 : 1) : (prev[0] < g.c[0] ? -1 : 1);
    const before = g.horiz ? [g.c[0], g.c[1] + sgn * APPROACH] : [g.c[0] + sgn * APPROACH, g.c[1]];
    const after = g.horiz ? [g.c[0], g.c[1] - sgn * APPROACH] : [g.c[0] - sgn * APPROACH, g.c[1]];
    P.push(before, g.c, after);
    doors.push({ id: wp.door, at: P.length - 2 });
  }
  return { ...r, P, doors };
});

// скругление углов: дуги окружности, длина считается по самой линии
const R = 0.45;
function rounded(P) {
  let d = `M ${f(X(P[0][0]))} ${f(Y(P[0][1]))}`;
  let L = 0, cur = P[0];
  const marks = []; // длина вдоль линии до каждой вершины (для центров дверей)
  marks[0] = 0;
  for (let i = 1; i < P.length; i++) {
    const p = P[i];
    if (i === P.length - 1) {
      L += Math.hypot(p[0] - cur[0], p[1] - cur[1]); d += ` L ${f(X(p[0]))} ${f(Y(p[1]))}`; marks[i] = L; break;
    }
    const n = P[i + 1];
    const v1 = [p[0] - P[i - 1][0], p[1] - P[i - 1][1]], v2 = [n[0] - p[0], n[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
    const cosA = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const phi = Math.acos(cosA);                    // угол поворота
    if (phi < 1e-3) { L += Math.hypot(p[0] - cur[0], p[1] - cur[1]); d += ` L ${f(X(p[0]))} ${f(Y(p[1]))}`; cur = p; marks[i] = L; continue; }
    let t = R * Math.tan(phi / 2);
    const curLen = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
    t = Math.min(t, curLen * 0.98, l2 * 0.5);
    const r = t / Math.tan(phi / 2);
    const a = [p[0] - u1[0] * t, p[1] - u1[1] * t], b = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    L += Math.hypot(a[0] - cur[0], a[1] - cur[1]);
    const cross = u1[0] * u2[1] - u1[1] * u2[0];
    const sweep = cross > 0 ? 0 : 1;               // ось Y экрана перевёрнута
    d += ` L ${f(X(a[0]))} ${f(Y(a[1]))} A ${f(r * S)} ${f(r * S)} 0 0 ${sweep} ${f(X(b[0]))} ${f(Y(b[1]))}`;
    marks[i] = L + (r * phi) / 2;
    L += r * phi;
    cur = b;
  }
  return { d, L, marks };
}
for (const r of routes) Object.assign(r, rounded(r.P));

// ---------- нумерация дверей по ходу маршрутов ----------
const doorNo = {};
let k = 0;
for (const r of routes) for (const dd of r.doors) if (!(dd.id in doorNo)) doorNo[dd.id] = ++k;

// ---------- план ----------
const plate = [];
plate.push(`<polygon points="${pts(plan.outline.polygon)}" fill="#FFFFFF"/>`);
for (const r of plan.rooms) plate.push(`<polygon points="${pts(r.polygon)}" fill="${r.id === "R8" ? "#ECE9E3" : "#FBFAF7"}"/>`);
for (const w of plan.walls) {
  const t = w.thickness / 2, hz = Math.abs(w.a[1] - w.b[1]) < 1e-9;
  const x0 = Math.min(w.a[0], w.b[0]) - (hz ? 0 : t), x1 = Math.max(w.a[0], w.b[0]) + (hz ? 0 : t);
  const y0 = Math.min(w.a[1], w.b[1]) - (hz ? t : 0), y1 = Math.max(w.a[1], w.b[1]) + (hz ? t : 0);
  plate.push(`<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="${w.kind === "partition" ? "#D9D5CE" : "#C9C4BB"}"/>`);
}
for (const o of plan.openings) {
  const w = wallById[o.wall.split("/")[0]];
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9, t = w.thickness / 2 + 0.02;
  const x0 = hz ? Math.min(o.a[0], o.b[0]) : w.a[0] - t, x1 = hz ? Math.max(o.a[0], o.b[0]) : w.a[0] + t;
  const y0 = hz ? w.a[1] - t : Math.min(o.a[1], o.b[1]), y1 = hz ? w.a[1] + t : Math.max(o.a[1], o.b[1]);
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  plate.push(`<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="${isWin ? "#E2EDF3" : "#FBFAF7"}"/>`);
}
for (const c of plan.columns) plate.push(`<polygon points="${pts(c.polygon)}" fill="#C9C4BB"/>`);
const labelAt = { R3: [1.75, 1.1], R7: [6.3, 6.4], R1: [8.4, 12.1], R8: [10.9, 0.65], R4: [6.0, 1.2], R5: [10.85, 4.75], R9: [9.45, 2.7], R2: [2.375, 11.1] };
for (const r of plan.rooms) {
  const [cx, cy] = labelAt[r.id] || centroid(r.polygon);
  const small = r.area_table < 6;
  plate.push(`<text x="${f(X(cx))}" y="${f(Y(cy))}" font-size="${small ? 17 : 21}" font-weight="600" text-anchor="middle" fill="#6F685F">${r.name.split(" (")[0]}</text>`);
}
for (const z of plan.zones.filter((z) => z.room === "R1")) {
  const [zx, zy] = z.point;
  plate.push(`<circle cx="${f(X(zx))}" cy="${f(Y(zy))}" r="5" fill="#6F685F"/>`);
  plate.push(`<text x="${f(X(zx))}" y="${f(Y(zy) - 14)}" font-size="16" text-anchor="middle" fill="#6F685F">${z.name} <tspan fill="#9A4322" font-size="13">условно</tspan></text>`);
}

// ---------- стили маршрутов ----------
const style = {
  morning: { col: "#E3962B", ink: "#8A5208", w: 21 },
  morning2: { col: "#D9534F", ink: "#A12E2A", w: 16 },
  morning3: { col: "#C7A20F", ink: "#6E5A00", w: 11 },
  guest: { col: "#17877D", ink: "#0F5F58", w: 8 },
  groceries: { col: "#6B4FD6", ink: "#4E35B0", w: 4 },
};
const T0 = 0.3, DUR = 0.42, GAP = 0.04;
routes.forEach((r, i) => { r.t0 = T0 + i * (DUR + GAP); r.st = style[r.id]; });

const lines = routes.map((r) => `<path id="rt-${r.id}" d="${r.d}" fill="none" stroke="${r.st.col}" stroke-width="${r.st.w}" stroke-linecap="butt" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join("\n");
const ends = routes.map((r) => {
  const a = r.P[0], b = r.P[r.P.length - 1];
  return `<g id="rt-${r.id}-start"><circle cx="${f(X(a[0]))}" cy="${f(Y(a[1]))}" r="${r.st.w / 2 + 5}" fill="#FFFFFF" stroke="${r.st.col}" stroke-width="4"/></g>
<g id="rt-${r.id}-end"><circle cx="${f(X(b[0]))}" cy="${f(Y(b[1]))}" r="${r.st.w / 2 + 5}" fill="${r.st.col}" stroke="#FFFFFF" stroke-width="3"/></g>`;
}).join("\n");

// бейджи дверей — появляются, когда первая линия доходит до двери
const firstReach = {};
for (const r of routes) for (const dd of r.doors) {
  const t = r.t0 + (r.marks[dd.at] / r.L) * DUR;
  if (!(dd.id in firstReach)) firstReach[dd.id] = t;
}
const badgeOffset = { D5: [-0.75, 0], D4: [0, -0.62], A1: [-0.95, 0], D1: [-0.95, 0], D2: [-0.9, 0], D7: [-1.05, 0.3], D6: [-1.05, -0.3] };
const badges = Object.entries(doorNo).map(([id, n]) => {
  const o = openById[id], g = doorGeom(o);
  const [ox, oy] = badgeOffset[id] || [0, -0.6];
  const bx = X(g.c[0] + ox), by = Y(g.c[1] + oy);
  const exact = /размер/.test(o.source) && !/масштаб/.test(o.source.split(";")[0]);
  return `<g id="door-${id}">
  <line x1="${f(X(g.c[0]))}" y1="${f(Y(g.c[1]))}" x2="${f(bx)}" y2="${f(by)}" stroke="#23201C" stroke-width="1.2"/>
  <circle cx="${f(bx)}" cy="${f(by)}" r="17" fill="#23201C"/>
  <text x="${f(bx)}" y="${f(by + 6)}" font-size="18" font-weight="700" text-anchor="middle" fill="#FFFFFF">${n}</text>
  <rect x="${f(bx - 31)}" y="${f(by + 21)}" width="62" height="22" rx="5" fill="#FFFFFF" stroke="#23201C" stroke-width="1"/>
  <text x="${f(bx)}" y="${f(by + 37)}" font-size="15" font-weight="700" text-anchor="middle" fill="#23201C">${exact ? "" : "≈"}${fmt(o.width)}</text>
</g>`;
}).join("\n");

// ---------- легенда ----------
const LY = PY0 + 56;
const legendRows = routes.map((r, i) => `
  <div class="row" id="lg-${r.id}">
    <svg width="64" height="26"><line x1="2" y1="13" x2="62" y2="13" stroke="${r.st.col}" stroke-width="${r.st.w}"/></svg>
    <div class="nm"><b>${r.name}</b><span>${r.stops} · двери ${r.doors.map((d) => doorNo[d.id]).filter((v, j, a) => a.indexOf(v) === j).join(", ")}</span></div>
    <div class="len" style="color:${r.st.ink}"><span id="len-${r.id}">0,00</span> м</div>
  </div>`).join("");
const doorList = Object.entries(doorNo).map(([id, n]) => {
  const o = openById[id];
  const exact = /размер/.test(o.source) && !/масштаб/.test(o.source.split(";")[0]);
  return `<span class="dn">${n}</span> ${exact ? "" : "≈"}${fmt(o.width)} м${o.type === "opening" ? " (проход)" : ""}`;
}).join(" &nbsp; ");

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #23201C; }
    #rt-svg { position: absolute; inset: 0; }
    #rt-head { position: absolute; left: 64px; right: 64px; top: 84px; }
    #rt-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #8A6230; }
    #rt-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #rt-head .d { font-size: 23px; color: #5E574E; margin-top: 12px; }
    #rt-legend { position: absolute; left: 64px; right: 64px; top: ${LY}px; }
    #rt-legend .row { display: flex; align-items: center; gap: 20px; padding: 9px 0; border-bottom: 1.5px solid #DDD6CA; }
    #rt-legend .nm { flex: 1; display: flex; flex-direction: column; gap: 3px; }
    #rt-legend .nm b { font-size: 24px; }
    #rt-legend .nm span { font-size: 17px; color: #5E574E; }
    #rt-legend .len { font-size: 38px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; min-width: 230px; text-align: right; }
    #rt-doors { margin-top: 12px; font-size: 16.5px; color: #3A3530; line-height: 1.6; }
    #rt-doors .dn { display: inline-block; width: 26px; height: 26px; line-height: 26px; border-radius: 13px; background: #23201C; color: #fff; text-align: center; font-weight: 700; font-size: 15px; }
    #rt-note { margin-top: 10px; font-size: 17px; color: #5E574E; line-height: 1.45; }
    #rt-note b { color: #9A4322; }
  </style>
  <div id="root" data-composition-id="routes" data-width="1080" data-height="1920">
    <svg id="rt-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      <g id="rt-plan">${plate.join("\n")}</g>
      <g id="rt-lines">${lines}</g>
      <g id="rt-ends">${ends}</g>
      <g id="rt-badges">${badges}</g>
    </svg>
    <div id="rt-head">
      <div class="k">ШИГАЛИ · ДОМ 06-2018-АС</div>
      <div class="t">Маршруты по дому</div>
      <div class="d">Линии идут через центры дверей · ○ старт, ● финиш</div>
    </div>
    <div id="rt-legend">
      ${legendRows}
      <div id="rt-doors">Двери на пути: ${doorList}</div>
      <div id="rt-note"><b>Условно:</b> точки «кухня» и «гостиная» внутри общей комнаты, обход в ванной, ширины дверей со знаком ≈ — сняты по масштабу. Длина — по самой линии, со скруглениями.</div>
    </div>
  </div>
  <script>
    (function () {
      const R = ${JSON.stringify(routes.map((r) => ({ id: r.id, L: +r.L.toFixed(4), t0: +r.t0.toFixed(3) })))};
      const DUR = ${DUR};
      const fmt = (n) => n.toFixed(2).replace(".", ",");
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#rt-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.fromTo("#rt-plan", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, 0.05);
      tl.fromTo("#rt-legend", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0.15);
      for (const r of R) {
        const el = document.getElementById("len-" + r.id);
        const st = { v: 0 };
        tl.fromTo("#rt-" + r.id + "-start", { opacity: 0 }, { opacity: 1, duration: 0.1 }, r.t0 - 0.05);
        tl.fromTo("#rt-" + r.id, { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: DUR, ease: "none" }, r.t0);
        tl.fromTo(st, { v: 0 }, { v: r.L, duration: DUR, ease: "none", onUpdate: () => { el.textContent = fmt(st.v); } }, r.t0);
        tl.fromTo("#rt-" + r.id + "-end", { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.15, ease: "back.out(2)" }, r.t0 + DUR - 0.02);
        tl.fromTo("#lg-" + r.id, { opacity: 0.35 }, { opacity: 1, duration: 0.15 }, r.t0);
      }
      const B = ${JSON.stringify(Object.fromEntries(Object.entries(firstReach).map(([k, v]) => [k, +v.toFixed(3)])))};
      for (const id in B) tl.fromTo("#door-" + id, { opacity: 0, scale: 0.5, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.16, ease: "back.out(2)" }, B[id]);
      tl.fromTo("#rt-doors", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.5);
      tl.fromTo("#rt-note", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.6);
      window.__timelines = window.__timelines || {};
      window.__timelines["routes"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/routes.html", import.meta.url), html);
console.log(routes.map((r) => [r.id, r.L.toFixed(2), r.doors.map((d) => d.id + "#" + doorNo[d.id])]), firstReach);
