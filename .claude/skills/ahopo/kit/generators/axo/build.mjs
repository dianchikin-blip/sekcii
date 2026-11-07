// Генерирует compositions/axo.html — разнесённую аксонометрию — СТРОГО из ../plan.json.
// Запуск: node build.mjs
import fs from "node:fs";
import { furnitureSVG } from "../furniture.mjs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
// Аудитория: AUDIENCE=client node build.mjs — чистая версия для клиента (без технических отметок)
const CLIENT = (process.env.AUDIENCE || plan.audience || "architect") === "client";
const KICKER = CLIENT ? (plan.meta.client_kicker || plan.meta.title.toUpperCase()) : plan.meta.kicker;
const A = Object.fromEntries(plan.assumptions.map((a) => [a.id, a]));
const H = A["A-heights"].value;
const WALL_TOP = H.wall_top;          // 2.952 — условно
const SILL = H.window_sill;           // 0.59 — по проекту
const HEAD = H.window_head;           // 2.42 — по проекту
const DOOR = H.door_head;             // 2.10 — условно
const ROOF_T = A["A-roof-render"].value.thickness;

// ---------- проекция: изометрия с юго-запада (север ≈ верх листа — условно) ----------
const W = 1080, HH = 1920;
const C = Math.cos(Math.PI / 6), Sn = 0.5;
const GAP1 = 11.5, GAP2 = 14.0 - WALL_TOP;        // разнос слоёв, м
const Z_WALLS = GAP1, Z_ROOF = GAP1 + WALL_TOP + GAP2;
const out = plan.outline.polygon;
const allPts = [...out, ...plan.rooms.flatMap((r) => r.polygon)];
const proj0 = (x, y) => [(x - y) * C, -(x + y) * Sn];
const sxs = allPts.map((p) => proj0(...p)[0]);
const sys = allPts.map((p) => proj0(...p)[1]);
const S = 34;                                       // px на метр
const bboxH = (Math.max(...sys) - Math.min(...sys) + Z_ROOF + ROOF_T) * S;
const OX = 655 - ((Math.max(...sxs) + Math.min(...sxs)) / 2) * S;
const OY = 1660 - Math.max(...sys) * S;
const P = (x, y, z = 0) => [OX + (x - y) * C * S, OY - (x + y) * Sn * S - z * S];
const f = (n) => n.toFixed(1);
const pts = (arr) => arr.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
const fmt = (n) => n.toFixed(2).replace(".", ",");

// ---------- цвета ----------
const roomColor = (name) =>
  /Кухня/.test(name) ? "#E9D8BF" : /Спальня/.test(name) ? "#CDD9CC" : /Ванная|Душевая/.test(name) ? "#C6D5DF"
  : /Гардероб/.test(name) ? "#DCD2DF" : /Котельная/.test(name) ? "#E5CCC0" : /Крыльцо/.test(name) ? "#DEDCD6" : "#ECE6DA";

// ---------- слой 1: пол ----------
const floor = [];
floor.push(`<polygon points="${pts(out.map((p) => P(...p)))}" fill="#D9D3C8"/>`); // подложка под стенами
for (const r of plan.rooms) floor.push(`<polygon points="${pts(r.polygon.map((p) => P(...p)))}" fill="${roomColor(r.name)}"/>`);
floor.push(furnitureSVG(plan, (p) => P(p[0], p[1]), { stroke: "#8C8377", width: 0.9 }));
// дуги открывания дверей на полу
const wallById = Object.fromEntries(plan.walls.map((w) => [w.id, w]));
for (const o of plan.openings) {
  const leaves = o.leaves || (o.hinge ? [{ hinge: o.hinge, width: o.width }] : []);
  if (!leaves.length) continue;
  const w = wallById[o.wall.split("/")[0]];
  const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const c = horiz ? w.a[1] : w.a[0];
  let side;
  if (o.opens_into === "outside") side = horiz ? [0, 1] : [1, 0];
  else {
    const room = plan.rooms.find((r) => r.id === o.opens_into);
    const cx = room.polygon.reduce((s, p) => s + p[0], 0) / room.polygon.length;
    const cy = room.polygon.reduce((s, p) => s + p[1], 0) / room.polygon.length;
    side = horiz ? [0, cy > c ? 1 : -1] : [cx > c ? 1 : -1, 0];
  }
  const mid = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
  for (const lf of leaves) {
    const [hx, hy] = horiz ? [lf.hinge[0], c] : [c, lf.hinge[1]];
    const al = horiz ? [mid[0] > hx ? 1 : -1, 0] : [0, mid[1] > hy ? 1 : -1];
    const arc = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI / 2;
      arc.push(P(hx + (al[0] * Math.cos(t) + side[0] * Math.sin(t)) * lf.width, hy + (al[1] * Math.cos(t) + side[1] * Math.sin(t)) * lf.width));
    }
    floor.push(`<polyline points="${pts(arc)}" fill="none" stroke="#8C8377" stroke-width="1" stroke-dasharray="3 3"/>`);
    floor.push(`<line x1="${f(P(hx, hy)[0])}" y1="${f(P(hx, hy)[1])}" x2="${f(arc[16][0])}" y2="${f(arc[16][1])}" stroke="#8C8377" stroke-width="1.2"/>`);
  }
}
// подписи комнат, лежащие на плоскости пола: ось текста вдоль +X (восток), «вниз» текста — на юг
const centroid = (poly) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const labelPos = plan.render_hints?.label_points?.axo || {}; // точки внутри неправильных комнат
const labels = [];
for (const r of plan.rooms) {
  const [cx, cy] = labelPos[r.id] || centroid(r.polygon);
  const big = r.id === "R1";
  const k = big ? 1.25 : (r.area_table < 6 ? 0.8 : 1);
  const [ex, ey] = P(cx, cy);
  const m = `matrix(${f(C * S / 100 * 100) / 100},${-Sn},${C},${Sn},${f(ex)},${f(ey)})`;
  labels.push(`<g data-layout-allow-overlap paint-order="stroke" stroke="${roomColor(r.name)}" stroke-width="4" stroke-linejoin="round" transform="matrix(${(C).toFixed(4)},${(-Sn).toFixed(4)},${C.toFixed(4)},${Sn.toFixed(4)},${f(ex)},${f(ey)})">`
    + `<text x="0" y="${f(-0.08 * S * k)}" text-anchor="middle" font-size="${f(0.42 * S * k)}" font-weight="700" fill="#2A2724">${r.name.split(" (")[0]}</text>`
    + `<text x="0" y="${f(0.42 * S * k)}" text-anchor="middle" font-size="${f(0.36 * S * k)}" fill="#5E574E">${fmt(r.area_table)} м²</text></g>`);
}

// ---------- слой 2: стены (коробки с настоящими проёмами) ----------
const boxes = [];
const openingsByWall = {};
for (const o of plan.openings) for (const wid of o.wall.split("/")) (openingsByWall[wid] ||= []).push(o);
for (const w of plan.walls) {
  const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const t = w.thickness / 2;
  const lo = horiz ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const hi = horiz ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const c = horiz ? w.a[1] : w.a[0];
  const mk = (s0, s1, z0, z1, kind = w.kind) => {
    if (s1 - s0 < 1e-3) return;
    boxes.push(horiz ? { x0: s0, x1: s1, y0: c - t, y1: c + t, z0, z1, kind } : { x0: c - t, x1: c + t, y0: s0, y1: s1, z0, z1, kind });
  };
  const ops = (openingsByWall[w.id] || [])
    .map((o) => {
      const s0 = horiz ? Math.min(o.a[0], o.b[0]) : Math.min(o.a[1], o.b[1]);
      const s1 = horiz ? Math.max(o.a[0], o.b[0]) : Math.max(o.a[1], o.b[1]);
      const isWin = o.type === "window" || o.type === "fixed_glazing";
      return { s0: Math.max(s0, lo), s1: Math.min(s1, hi), z0: isWin ? SILL : 0, z1: isWin ? HEAD : DOOR, glass: isWin };
    })
    .filter((o) => o.s1 > o.s0)
    .sort((a, b) => a.s0 - b.s0);
  let cur = lo;
  for (const o of ops) {
    mk(cur, o.s0, 0, WALL_TOP);
    if (o.z0 > 0) mk(o.s0, o.s1, 0, o.z0);
    mk(o.s0, o.s1, o.z1, WALL_TOP);
    if (o.glass) boxes.push(horiz
      ? { x0: o.s0, x1: o.s1, y0: c - 0.015, y1: c + 0.015, z0: o.z0, z1: o.z1, kind: "glass" }
      : { x0: c - 0.015, x1: c + 0.015, y0: o.s0, y1: o.s1, z0: o.z0, z1: o.z1, kind: "glass" });
    cur = o.s1;
  }
  mk(cur, hi, 0, WALL_TOP);
}
for (const col of plan.columns) {
  const xs = col.polygon.map((p) => p[0]), ys = col.polygon.map((p) => p[1]);
  boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: 0, z1: WALL_TOP, kind: "external" });
}
// порядок отрисовки: от дальних (северо-восток) к ближним (юго-запад)
const eps = 1e-3;
const front = (a, b) => { // a перед b?
  const ovX = a.x0 < b.x1 - eps && b.x0 < a.x1 - eps;
  const ovY = a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
  if (ovX && ovY) return a.z0 >= b.z1 - eps;      // одна колонка: верхнее рисуем позже
  if (a.x1 <= b.x0 + eps && (ovY || a.y0 < b.y1)) return true;
  if (a.y1 <= b.y0 + eps && (ovX || a.x0 < b.x1)) return true;
  return false;
};
const n = boxes.length, deps = boxes.map(() => []);
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && front(boxes[i], boxes[j])) deps[i].push(j);
const order = [], state = new Array(n).fill(0);
const visit = (i) => { if (state[i] === 2) return; if (state[i] === 1) return; state[i] = 1; for (const j of deps[i]) visit(j); state[i] = 2; order.push(i); };
for (let i = 0; i < n; i++) visit(i);
const sorted = order.map((i) => boxes[i]);

const shade = {
  external: { top: "#2B2926", s: "#F2EEE7", w: "#D8D1C5" },
  internal_bearing: { top: "#4A443D", s: "#ECE6DC", w: "#D2CABD" },
  partition: { top: "#7B7368", s: "#EFEAE2", w: "#D9D2C7" },
  glass: { top: "#9EC3D8", s: "#B9D6E6", w: "#A9CADC", op: 0.55 },
};
const wallEls = sorted.map((b, i) => {
  const sh = shade[b.kind];
  const op = sh.op ? ` fill-opacity="${sh.op}"` : "";
  return `<g class="bx" data-b="${[b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].map((v) => +v.toFixed(3)).join(",")}">`
    + `<polygon fill="${sh.w}"${op}/><polygon fill="${sh.s}"${op}/><polygon fill="${sh.top}"${op}/></g>`;
}).join("\n");

// ---------- слой 3: двускатная крыша (конёк вдоль Y на ridge_x; высоты — условно) ----------
const RF = A["A-roof"].value;
const XR = RF.ridge_x, RZ = RF.ridge_z - WALL_TOP;           // высота конька над карнизом
const xs0 = out.map((p) => p[0]), XMIN = Math.min(...xs0), XMAX = Math.max(...xs0);
const hR = (x) => (x <= XR ? RZ * (x - XMIN) / (XR - XMIN) : RZ * (XMAX - x) / (XMAX - XR));
const R3 = (x, y) => P(x, y, hR(x));
const rz1 = 0;
// контур делим на западную (x ≤ XR) и восточную (x ≥ XR) части
const clipX = (poly, keepLeft) => {           // отсечение многоугольника вертикалью x = XR
  const res = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ina = keepLeft ? a[0] <= XR + 1e-9 : a[0] >= XR - 1e-9, inb = keepLeft ? b[0] <= XR + 1e-9 : b[0] >= XR - 1e-9;
    if (ina) res.push(a);
    if (ina !== inb) { const t = (XR - a[0]) / (b[0] - a[0]); res.push([XR, a[1] + t * (b[1] - a[1])]); }
  }
  return res;
};
const westP = clipX(out, true), eastP = clipX(out, false);
const roof = [];
const face = (q, fill) => roof.push(`<polygon points="${pts(q)}" fill="${fill}"/>`);
// 1) восточный скат (дальше от зрителя)
face(eastP.map((p) => R3(p[0], p[1])), "#6E7B78");
// 2) вертикальные фронтоны: видимы только грани с нормалью на юг (−y) или запад (−x); от дальних к ближним
const gables = [];
for (let i = 0; i < out.length; i++) {
  const a = out[i], b = out[(i + 1) % out.length];
  const nx = b[1] - a[1], ny = -(b[0] - a[0]);
  if (!(nx < -eps || ny < -eps)) continue;
  // ребро может пересекать конёк — режем
  const segs = (a[0] - XR) * (b[0] - XR) < 0 ? [[a, [XR, a[1]]], [[XR, a[1]], b]] : [[a, b]];
  for (const [p, q] of segs) gables.push({ p, q, d: p[0] + p[1] + q[0] + q[1] });
}
// грань, где восточный скат выше западного контура (торец выступа у конька)
gables.sort((u, v) => v.d - u.d);
for (const g of gables) face([P(g.p[0], g.p[1], 0), P(g.q[0], g.q[1], 0), R3(g.q[0], g.q[1]), R3(g.p[0], g.p[1])], Math.abs(g.p[1] - g.q[1]) < eps ? "#E9E4DB" : "#D6D0C5");
const yW = westP.map((p) => p[1]), yE = eastP.map((p) => p[1]);
if (Math.max(...yE) > Math.max(...yW) + eps) {
  const y0 = Math.max(...yW), y1 = Math.max(...yE);
  face([P(XR, y0, 0), P(XR, y1, 0), P(XR, y1, RZ), P(XR, y0, RZ)], "#D6D0C5");
}
// 3) западный скат (ближе)
face(westP.map((p) => R3(p[0], p[1])), "#59666A");
// фальцы вдоль ската
const yMinW = Math.min(...yW), yMaxW = Math.max(...yW);
for (let y = yMinW + 0.4; y < yMaxW - 0.1; y += 0.8) roof.push(`<line x1="${f(R3(XMIN, y)[0])}" y1="${f(R3(XMIN, y)[1])}" x2="${f(R3(XR, y)[0])}" y2="${f(R3(XR, y)[1])}" stroke="#6C797D" stroke-width="1"/>`);
const yMaxE = Math.max(...yE);
for (let y = Math.min(...yE) + 0.4; y < yMaxE - 0.1; y += 0.8) {
  // правый край восточного ската на этой широте
  let xr = XR;
  for (let i = 0; i < eastP.length; i++) {
    const a = eastP[i], b = eastP[(i + 1) % eastP.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && Math.abs(a[1] - b[1]) > eps) xr = Math.max(xr, a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  }
  roof.push(`<line x1="${f(R3(XR, y)[0])}" y1="${f(R3(XR, y)[1])}" x2="${f(R3(xr, y)[0])}" y2="${f(R3(xr, y)[1])}" stroke="#80908C" stroke-width="1"/>`);
}

// ---------- пунктирные вертикали по углам ----------
const dashes = out.map((p) => {
  const a = P(p[0], p[1], 0), b = P(p[0], p[1], Z_ROOF + ROOF_T);
  return `<line class="dash" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#9A9184" stroke-width="1.4" stroke-dasharray="6 7"/>`;
}).join("\n");

// ---------- подписи слоёв (слева, у западного угла каждого слоя) ----------
const nw = out.reduce((m, p) => ((p[0] - p[1]) < (m[0] - m[1]) ? p : m), out[0]);
const anchor = (z) => P(nw[0], nw[1], z);
const L1 = anchor(0), L2 = anchor(Z_WALLS + WALL_TOP), L3 = anchor(Z_ROOF + 0.3);
const totalTable = plan.area_summary.total_table_stated;

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #23201C; }
    #axo-svg { position: absolute; inset: 0; }
    .lab { position: absolute; left: 56px; width: 230px; }
    .lab .no { font-size: 22px; font-weight: 700; letter-spacing: .12em; color: #A0743F; }
    .lab .nm { font-size: 38px; font-weight: 700; letter-spacing: -0.01em; margin-top: 4px; }
    .lab .sub { font-size: 19px; line-height: 1.38; color: #6A6359; margin-top: 8px; }
    .tag { display: inline-block; font-size: 15px; line-height: 1.3; font-weight: 700; letter-spacing: .06em; color: #9A4322; border: 1.5px solid #9A4322; border-radius: 6px; padding: 2px 8px; margin-top: 10px; }
    #axo-head { position: absolute; left: 64px; right: 64px; top: 92px; }
    #axo-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #A0743F; }
    #axo-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #axo-head .d { font-size: 24px; color: #6A6359; margin-top: 14px; }
    #axo-foot { position: absolute; left: 64px; right: 64px; bottom: 96px; font-size: 21px; line-height: 1.45; color: #6A6359; border-top: 1.5px solid #D8D1C5; padding-top: 18px; }
    #axo-foot b { color: #9A4322; }
    ${CLIENT ? "#axo-foot { display: none; }" : ""}
  </style>
  <div id="root" data-composition-id="axo" data-width="1080" data-height="1920">
    <svg id="axo-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      
      <g id="axo-dashes">${dashes}</g>
      <g id="axo-floor-l"><g id="axo-floor">${floor.join("\n")}<g id="axo-flabels">${labels.join("\n")}</g></g></g>
      <g id="axo-walls-l" transform="translate(0,${f(-Z_WALLS * S)})"><g id="axo-walls">${wallEls}</g></g>
      <g id="axo-roof-l" transform="translate(0,${f(-Z_ROOF * S)})"><g id="axo-roof">${roof.join("\n")}</g></g>
    </svg>

    <div id="axo-head">
      <div class="k">${KICKER}</div>
      <div class="t">${CLIENT ? "Дом по слоям" : "Разнесённая<br>аксонометрия"}</div>
      <div class="d">${CLIENT ? `Пол · стены · крыша · ${fmt(totalTable)} м²` : `Вид с юго-запада <span class="tag" style="margin:0 0 0 8px;font-size:15px">УСЛОВНО</span> · ${fmt(totalTable)} м² по проекту`}</div>
    </div>

    <div id="lab-roof" class="lab" style="top:${f(L3[1] - 120)}px">
      <div class="no">03</div><div class="nm">Крыша</div>
      <div class="sub">Двускатная${CLIENT ? "" : `,<br>конёк ≈ ${fmt(RF.ridge_z)} м`}</div>
      ${CLIENT ? "" : `<div class="tag">УСЛОВНО</div>`}
    </div>
    <div id="lab-walls" class="lab" style="top:${f(L2[1] - 150)}px">
      <div class="no">02</div><div class="nm">Стены</div>
      ${CLIENT ? `<div class="sub">Окна и двери<br>на своих местах</div>` : `<div class="sub">Наружные 0,41 м,<br>проёмы из плана.<br>Окна 0,59–2,42 м<br>по разрезу</div>
      <div class="tag">ВЫСОТА ${fmt(WALL_TOP)} М,<br>ДВЕРИ ${fmt(DOOR)} М — УСЛОВНО</div>`}
    </div>
    <div id="lab-floor" class="lab" style="top:${f(L1[1] - 130)}px">
      <div class="no">01</div><div class="nm">Пол</div>
      <div class="sub">${plan.rooms.length} помещений,<br>площади<br>${CLIENT ? "по проекту" : "по экспликации"}</div>
    </div>

    <div id="axo-foot">Построено только из plan.json. <b>Условно:</b> сторона света (север ≈ верх листа), высота стен и дверей, плоская крыша.</div>
  </div>
  <script>
    (function () {
      const C = ${C}, Sn = ${Sn}, S = ${S}, OX = ${OX}, OY = ${OY};
      const P = (x, y, z) => [OX + (x - y) * C * S, OY - (x + y) * Sn * S - z * S];
      const pts = (a) => a.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
      const bx = Array.from(document.querySelectorAll("#axo-walls .bx")).map((g) => ({ b: g.dataset.b.split(",").map(Number), f: g.querySelectorAll("polygon") }));
      const st = { g: 1 };
      function draw() {
        const k = st.g;
        for (const it of bx) {
          const [x0, x1, y0, y1, z0r, z1r] = it.b, z0 = z0r * k, z1 = z1r * k;
          it.f[0].setAttribute("points", pts([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)]));   // запад
          it.f[1].setAttribute("points", pts([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)]));   // юг
          it.f[2].setAttribute("points", pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]));   // верх
        }
      }
      draw();
      const WL = ${f(Z_WALLS * S)};
      const tl = gsap.timeline({ paused: true });
      // 1. пол проявляется
      tl.fromTo("#axo-floor", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, 0);
      tl.fromTo("#axo-flabels", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 0.35);
      tl.fromTo("#lab-floor", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, 0.3);
      tl.fromTo("#axo-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0.05);
      // 2. стены вырастают из пола, затем поднимаются
      tl.fromTo("#axo-walls", { y: WL, opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, 0.55);
      tl.fromTo(st, { g: 0 }, { g: 1, duration: 0.6, ease: "power2.inOut", onUpdate: draw }, 0.55);
      tl.to("#axo-walls", { y: 0, duration: 0.6, ease: "power3.inOut" }, 1.15);
      tl.fromTo("#lab-walls", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, 1.4);
      // 3. крыша опускается на место
      tl.fromTo("#axo-roof", { y: -260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: "power3.out" }, 1.6);
      tl.fromTo("#lab-roof", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, 1.95);
      // 4. пунктирные вертикали связывают слои
      tl.fromTo("#axo-dashes", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, 2.15);
      tl.fromTo("#axo-foot", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 2.3);
      window.__timelines = window.__timelines || {};
      window.__timelines["axo"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/axo.html", import.meta.url), html);
console.log("boxes:", boxes.length, "S:", S.toFixed(1), "OY:", OY.toFixed(0), "roof top y:", P(0, 0, Z_ROOF)[1].toFixed(0), "floor bottom y:", P(0, 0)[1].toFixed(0));
