// Генерирует compositions/zoning.html — план зонирования — СТРОГО из ../plan.json.
// Все площади — из экспликации (area_table); суммы проверяются, при расхождении сборка падает.
import fs from "node:fs";
import { furnitureSVG } from "../furniture.mjs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
// Аудитория: AUDIENCE=client node build.mjs — чистая версия для клиента (без технических отметок)
const CLIENT = (process.env.AUDIENCE || plan.audience || "architect") === "client";
const KICKER = CLIENT ? (plan.meta.client_kicker || plan.meta.title.toUpperCase()) : plan.meta.kicker;
const W = 1080, HH = 1920;
const S = 60, PX0 = (W - 12.56 * S) / 2, PY0 = 290 + 13.3 * S;
const X = (x) => PX0 + x * S, Y = (y) => PY0 - y * S;
const f = (n) => n.toFixed(1);
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");
const pts = (poly) => poly.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(" ");
const roomById = Object.fromEntries(plan.rooms.map((r) => [r.id, r]));
const wallById = Object.fromEntries(plan.walls.map((w) => [w.id, w]));

// ---------- расчёт и проверка ----------
const C = { day: { fill: "#F5B577", ink: "#8A4A0E", bar: "#EE9A4E" }, night: { fill: "#A9D2EE", ink: "#1F5A86", bar: "#6FB0DE" }, service: { fill: "#AFD9A6", ink: "#2C6A28", bar: "#7EC173" } };
const zones = plan.zoning.zones.map((z) => ({ ...z, area: z.rooms.reduce((s, id) => s + roomById[id].area_table, 0) }));
const cents = (v) => Math.round(v * 100);
const total = zones.reduce((s, z) => s + cents(z.area), 0) / 100;
const stated = plan.area_summary.total_table_stated;
const roomsSum = plan.rooms.reduce((s, r) => s + cents(r.area_table), 0) / 100;
if (cents(total) !== cents(stated) || cents(roomsSum) !== cents(stated)) throw new Error(`сумма не сходится: зоны ${total}, комнаты ${roomsSum}, экспликация ${stated}`);
// доли — метод наибольшего остатка, до 0,1 %, чтобы в сумме было ровно 100
const raw = zones.map((z) => (z.area / total) * 1000);
const fl = raw.map(Math.floor);
let rest = 1000 - fl.reduce((a, b) => a + b, 0);
raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => fl[i]++);
zones.forEach((z, i) => (z.pct = fl[i] / 10));
if (Math.round(zones.reduce((s, z) => s + z.pct, 0) * 10) !== 1000) throw new Error("доли не дают 100 %");

// ---------- план ----------
const order = zones.flatMap((z) => z.rooms.map((id) => ({ id, z: z.id })));
const T0 = 0.45, STEP = 0.165, FD = 0.24;
order.forEach((o, i) => (o.t = T0 + i * STEP));
const centroid = (poly) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const labelAt = plan.render_hints?.label_points?.zoning || {};
const fills = order.map((o) => `<polygon id="zf-${o.id}" points="${pts(roomById[o.id].polygon)}" fill="${C[o.z].fill}"/>`).join("\n");
const FURN = furnitureSVG(plan, (p) => [X(p[0]), Y(p[1])], { stroke: "rgba(30,27,24,0.42)", width: 1, byRoom: true });
const furn = order.map((o) => `<g id="zfu-${o.id}">${FURN[o.id] || ""}</g>`).join("\n");
const labels = order.map((o) => {
  const r = roomById[o.id];
  const [cx, cy] = labelAt[o.id] || centroid(r.polygon);
  const small = r.area_table < 6;
  return `<g id="zl-${o.id}" paint-order="stroke" stroke="${C[o.z].fill}" stroke-width="5" stroke-linejoin="round"><text x="${f(X(cx))}" y="${f(Y(cy) - 2)}" font-size="${small ? 14 : 18}" font-weight="700" text-anchor="middle" fill="#1E1B18">${r.name.split(" (")[0]}</text>
<text x="${f(X(cx))}" y="${f(Y(cy) + (small ? 15 : 19))}" font-size="${small ? 13 : 16}" text-anchor="middle" fill="#3A3530">${fmt(r.area_table)} м²</text></g>`;
}).join("\n");
const wallsSvg = plan.walls.map((w) => {
  const t = w.thickness / 2, hz = Math.abs(w.a[1] - w.b[1]) < 1e-9;
  const x0 = Math.min(w.a[0], w.b[0]) - (hz ? 0 : t), x1 = Math.max(w.a[0], w.b[0]) + (hz ? 0 : t);
  const y0 = Math.min(w.a[1], w.b[1]) - (hz ? t : 0), y1 = Math.max(w.a[1], w.b[1]) + (hz ? t : 0);
  return `<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="${w.kind === "partition" ? "#7C766D" : "#3A3530"}"/>`;
});
for (const o of plan.openings) {
  const w = wallById[o.wall.split("/")[0]];
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9, t = w.thickness / 2 + 0.01;
  const c = hz ? w.a[1] : w.a[0];
  const x0 = hz ? Math.min(o.a[0], o.b[0]) : c - t, x1 = hz ? Math.max(o.a[0], o.b[0]) : c + t;
  const y0 = hz ? c - t : Math.min(o.a[1], o.b[1]), y1 = hz ? c + t : Math.max(o.a[1], o.b[1]);
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  wallsSvg.push(`<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="${isWin ? "#DCEAF2" : "#F3F0EA"}" fill-opacity="${isWin ? 1 : 0.0}"/>`);
}
// проёмы дверей «прорезаем» цветом фона комнаты не нужно: двери без заливки остаются как разрыв стены
const doorGaps = plan.openings.filter((o) => !(o.type === "window" || o.type === "fixed_glazing")).map((o) => {
  const w = wallById[o.wall.split("/")[0]];
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9, t = w.thickness / 2 + 0.01, c = hz ? w.a[1] : w.a[0];
  const x0 = hz ? Math.min(o.a[0], o.b[0]) : c - t, x1 = hz ? Math.max(o.a[0], o.b[0]) : c + t;
  const y0 = hz ? c - t : Math.min(o.a[1], o.b[1]), y1 = hz ? c + t : Math.max(o.a[1], o.b[1]);
  return `<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="#FFFFFF"/>`;
}).join("\n");
for (const c of plan.columns) wallsSvg.push(`<polygon points="${pts(c.polygon)}" fill="#3A3530"/>`);

// ---------- таблица, итог, полоса ----------
const TY = PY0 + 44;
const cols = zones.map((z) => `
  <div class="col">
    <div class="ch"><i style="background:${C[z.id].fill}"></i>${z.name}</div>
    ${z.rooms.map((id) => `<div class="tr" id="tr-${id}"><span>${roomById[id].name.split(" (")[0]}</span><span>${fmt(roomById[id].area_table)}</span></div>`).join("")}
    <div class="tt" style="color:${C[z.id].ink}"><span>Итого</span><span><b id="zt-${z.id}">0,00</b> м²</span></div>
  </div>`).join("");
const bar = zones.map((z) => `<div class="seg" style="flex:0 0 ${z.pct}%"><div class="fill" id="bar-${z.id}" style="background:${C[z.id].bar}"></div><div class="pc" id="pc-${z.id}" style="color:${C[z.id].ink}">${fmt(z.pct, 1)} %</div></div>`).join("");

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #1E1B18; }
    #zn-svg { position: absolute; inset: 0; }
    #zn-head { position: absolute; left: 64px; right: 64px; top: 84px; }
    #zn-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #8A6230; }
    #zn-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #zn-head .d { font-size: 23px; color: #5E574E; margin-top: 12px; }
    #zn-table { position: absolute; left: 56px; right: 56px; top: ${TY}px; display: flex; gap: 22px; }
    .col { flex: 1; display: flex; flex-direction: column; }
    .ch { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 2px solid #1E1B18; margin-bottom: 4px; white-space: nowrap; }
    .ch i { width: 16px; height: 16px; border-radius: 4px; display: inline-block; }
    .tr { display: flex; justify-content: space-between; font-size: 16px; line-height: 1.75; color: #3A3530; border-bottom: 1px solid #DDD6CA; }
    .tr span:last-child { font-variant-numeric: tabular-nums; }
    .tt { margin-top: auto; padding-top: 10px; display: flex; justify-content: space-between; font-size: 17px; font-weight: 700; }
    .tt b { font-variant-numeric: tabular-nums; }
    #zn-total { position: absolute; left: 56px; right: 56px; top: ${TY + 300}px; display: flex; align-items: baseline; justify-content: space-between; border-top: 2px solid #1E1B18; padding-top: 14px; }
    #zn-total .l { font-size: 24px; font-weight: 700; }
    #zn-total .l span { display: block; font-size: 16px; font-weight: 400; color: #5E574E; margin-top: 4px; }
    #zn-total .v { font-size: 64px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    #zn-bar { position: absolute; left: 56px; right: 56px; top: ${TY + 410}px; display: flex; height: 34px; border-radius: 8px; overflow: hidden; background: #E4DED3; }
    .seg { position: relative; height: 100%; }
    .seg .fill { position: absolute; inset: 0; transform-origin: 0% 50%; transform: scaleX(0); }
    #zn-pcts { position: absolute; left: 56px; right: 56px; top: ${TY + 452}px; display: flex; }
    #zn-pcts div { font-size: 22px; font-weight: 700; }
    #zn-note { position: absolute; left: 56px; right: 56px; top: ${TY + 500}px; font-size: 16px; line-height: 1.45; color: #5E574E; }
    #zn-note b { color: #9A4322; }
    ${CLIENT ? "#zn-note { display: none; }" : ""}
  </style>
  <div id="root" data-composition-id="zoning" data-width="1080" data-height="1920">
    <svg id="zn-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      <g id="zn-base"><polygon points="${pts(plan.outline.polygon)}" fill="#FFFFFF"/><polygon points="${pts(roomById.R8.polygon)}" fill="#FFFFFF"/></g>
      <g id="zn-fills">${fills}</g>
      <g id="zn-furn">${furn}</g>
      <g id="zn-walls">${wallsSvg.join("\n")}${doorGaps}</g>
      <g id="zn-labels">${labels}</g>
    </svg>
    <div id="zn-head">
      <div class="k">${KICKER}</div>
      <div class="t">Зонирование</div>
      <div class="d">День · ночь · службы и проходы — площади ${CLIENT ? "по проекту" : "по экспликации"}</div>
    </div>
    <div id="zn-table">${cols}</div>
    <div id="zn-total"><div class="l">Общая площадь${CLIENT ? "" : `<span>сумма проверена: ${fmt(stated)} м² по экспликации</span>`}</div><div class="v"><span id="zn-sum">0,00</span> м²</div></div>
    <div id="zn-bar">${zones.map((z) => `<div class="seg" style="flex:0 0 ${z.pct}%"><div class="fill" id="bar-${z.id}" style="background:${C[z.id].bar}"></div></div>`).join("")}</div>
    <div id="zn-pcts">${zones.map((z) => `<div id="pc-${z.id}" style="flex:0 0 ${z.pct}%;color:${C[z.id].ink}">${fmt(z.pct, 1)} %</div>`).join("")}</div>
    <div id="zn-note"><b>Условно:</b> гардеробная — в ночной зоне, крыльцо — в проходах. Доли округлены до 0,1 % так, что в сумме ровно 100 %.</div>
  </div>
  <script>
    (function () {
      const ORDER = ${JSON.stringify(order.map((o) => ({ id: o.id, z: o.z, t: +o.t.toFixed(3), a: roomById[o.id].area_table })))};
      const ZA = ${JSON.stringify(Object.fromEntries(zones.map((z) => [z.id, z.area])))};
      const FD = ${FD};
      const fmt = (n) => n.toFixed(2).replace(".", ",");
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#zn-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.fromTo(["#zn-base", "#zn-walls"], { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 0.05);
      tl.fromTo(["#zn-table", "#zn-total", "#zn-bar"], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0.2);
      const sumEl = document.getElementById("zn-sum");
      const ztEl = {}, barEl = {};
      for (const k in ZA) { ztEl[k] = document.getElementById("zt-" + k); barEl[k] = document.getElementById("bar-" + k); }
      const ease = gsap.parseEase("power1.inOut");
      // все числа и полоса — функция времени таймлайна (корректно при любой перемотке)
      function paint() {
        const t = tl.time();
        let sum = 0; const zs = {};
        for (const k in ZA) zs[k] = 0;
        for (const o of ORDER) {
          const p = ease(Math.min(1, Math.max(0, (t - o.t) / FD)));
          sum += o.a * p; zs[o.z] += o.a * p;
        }
        sumEl.textContent = fmt(Math.round(sum * 100) / 100);
        for (const k in ZA) {
          ztEl[k].textContent = fmt(Math.round(zs[k] * 100) / 100);
          barEl[k].style.transform = "scaleX(" + (zs[k] / ZA[k]).toFixed(4) + ")";
        }
      }
      for (const o of ORDER) {
        tl.fromTo("#zf-" + o.id, { opacity: 0 }, { opacity: 1, duration: FD, ease: "power2.out" }, o.t);
        tl.fromTo("#zfu-" + o.id, { opacity: 0 }, { opacity: 1, duration: FD, ease: "power2.out" }, o.t + 0.04);
        tl.fromTo("#zl-" + o.id, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: FD, ease: "power2.out" }, o.t + 0.05);
        tl.fromTo("#tr-" + o.id, { opacity: 0.25 }, { opacity: 1, duration: FD }, o.t);
      }
      const clock = { v: 0 };
      tl.fromTo(clock, { v: 0 }, { v: 1, duration: 3, ease: "none", onUpdate: paint }, 0);
      tl.fromTo("#zn-pcts", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.35);
      tl.fromTo("#zn-note", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.45);
      window.__timelines = window.__timelines || {};
      window.__timelines["zoning"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/zoning.html", import.meta.url), html);
console.log(zones.map((z) => [z.id, z.area.toFixed(2), z.pct]), "total", total, "stated", stated, "last fill ends", (order.at(-1).t + FD).toFixed(2));
