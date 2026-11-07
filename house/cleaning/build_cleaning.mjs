// План уборки для клининга: А4, PNG + PDF. Все цифры — из ../plan.json.
// Запуск: node build_cleaning.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { furnitureSVG } from "../furniture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const DIR = path.dirname(new URL(import.meta.url).pathname);
const plan = JSON.parse(fs.readFileSync(path.join(DIR, "../plan.json"), "utf8"));
const A = Object.fromEntries(plan.assumptions.map((a) => [a.id, a]));
const H = A["A-heights"].value;
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");
const room = Object.fromEntries(plan.rooms.map((r) => [r.id, r]));

// что убираем — в порядке обхода от входа
const CLEAN = [
  { id: "R9", name: "Прихожая (тамбур)" },
  { id: "R7", name: "Коридор" },
  { id: "R1", name: "Кухня-гостиная" },
  { id: "R5", name: "Ванная с туалетом" },
  { id: "R11", name: "Душевая с туалетом" },
];
const SHORT = { R9: "Прихожая", R7: "Коридор", R1: "Кухня-гостиная", R5: "Ванная", R11: "Душевая" };
const total = CLEAN.reduce((s, c) => s + room[c.id].area_table, 0);

// что внутри: мебель/сантехника из plan.json + окна (площадь стекла по высоте проёма)
const RU = { bath: "ванна", toilet: "унитаз", bidet: "биде", washbasin: "раковина", shower: "душевой поддон", sink: "мойка", stove: "плита", fridge: "холодильник", counter: "столешница", table: "обеденный стол", sofa: "диван", coffee_table: "журнальный столик", tv_unit: "ТВ-тумба", storage: "шкаф", chair: "стул" };
const inside = (rid) => {
  const cnt = {};
  for (const f of plan.furniture.items.filter((x) => x.room === rid)) if (RU[f.type]) cnt[RU[f.type]] = (cnt[RU[f.type]] || 0) + 1;
  if (cnt["диван"] === 2) { delete cnt["диван"]; cnt["угловой диван"] = 1; }          // угловой диван на плане из двух частей
  if (cnt["столешница"] === 2) { delete cnt["столешница"]; cnt["кухонная столешница углом"] = 1; }
  return Object.entries(cnt).map(([k, n]) => (n > 1 ? `${k} × ${n}` : k));
};
const glass = (rid) => {
  let n = 0, a = 0;
  for (const o of plan.openings) {
    const isWin = o.type === "window" || o.type === "fixed_glazing";
    const glazedDoor = o.type === "double_door";
    if (!(isWin || glazedDoor)) continue;
    const r = o.room || (o.opens_into === "outside" ? "R1" : null);
    if (r !== rid) continue;
    n++; a += o.width * (isWin ? H.window_head - H.window_sill : H.window_head);
  }
  return { n, a };
};
const extDoor = (rid) => plan.openings.filter((o) => o.type === "door" && o.opens_into === "R8" && rid === "R9").length;

// ---------- план ----------
const S = 46, PAD = 14;
const xs = plan.outline.polygon.map((p) => p[0]), ys = plan.outline.polygon.map((p) => p[1]);
const W = (Math.max(...xs) - Math.min(...xs)) * S + 2 * PAD, Hh = (Math.max(...ys) - Math.min(...ys)) * S + 2 * PAD;
const X = (x) => PAD + (x - Math.min(...xs)) * S, Y = (y) => PAD + (Math.max(...ys) - y) * S;
const f1 = (n) => n.toFixed(1);
const pts = (poly) => poly.map((p) => `${f1(X(p[0]))},${f1(Y(p[1]))}`).join(" ");
const centroid = (poly) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; const k = x1 * y2 - x2 * y1; a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k; }
  return [cx / (3 * a), cy / (3 * a)];
};
const hint = plan.render_hints?.label_points?.zoning || {};
const svg = [];
svg.push(`<defs><pattern id="skip" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#F1EFEB"/><line x1="0" y1="0" x2="0" y2="8" stroke="#DEDAD3" stroke-width="2"/></pattern></defs>`);
const cleanIds = new Set(CLEAN.map((c) => c.id));
for (const r of plan.rooms) svg.push(`<polygon points="${pts(r.polygon)}" fill="${cleanIds.has(r.id) ? "#BFE3DA" : "url(#skip)"}"/>`);
svg.push(furnitureSVG(plan, (p) => [X(p[0]), Y(p[1])], { stroke: "rgba(30,27,24,0.38)", width: 0.9 }));
const wallById = Object.fromEntries(plan.walls.map((w) => [w.id, w]));
for (const w of plan.walls) {
  const t = w.thickness / 2, hz = Math.abs(w.a[1] - w.b[1]) < 1e-9;
  const x0 = Math.min(w.a[0], w.b[0]) - (hz ? 0 : t), x1 = Math.max(w.a[0], w.b[0]) + (hz ? 0 : t);
  const y0 = Math.min(w.a[1], w.b[1]) - (hz ? t : 0), y1 = Math.max(w.a[1], w.b[1]) + (hz ? t : 0);
  svg.push(`<rect x="${f1(X(x0))}" y="${f1(Y(y1))}" width="${f1((x1 - x0) * S)}" height="${f1((y1 - y0) * S)}" fill="#2B2825"/>`);
}
for (const o of plan.openings) {
  const w = wallById[o.wall.split("/")[0]];
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9, t = w.thickness / 2 + 0.02, c = hz ? w.a[1] : w.a[0];
  const x0 = hz ? Math.min(o.a[0], o.b[0]) : c - t, x1 = hz ? Math.max(o.a[0], o.b[0]) : c + t;
  const y0 = hz ? c - t : Math.min(o.a[1], o.b[1]), y1 = hz ? c + t : Math.max(o.a[1], o.b[1]);
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  svg.push(`<rect x="${f1(X(x0))}" y="${f1(Y(y1))}" width="${f1((x1 - x0) * S)}" height="${f1((y1 - y0) * S)}" fill="${isWin ? "#CFE3EE" : "#FFFFFF"}"/>`);
}
for (const c of plan.columns) svg.push(`<polygon points="${pts(c.polygon)}" fill="#2B2825"/>`);
// подписи
for (const r of plan.rooms) {
  const [cx, cy] = hint[r.id] || centroid(r.polygon);
  const k = CLEAN.findIndex((c) => c.id === r.id);
  if (k >= 0) {
    svg.push(`<g paint-order="stroke" stroke="#BFE3DA" stroke-width="5" stroke-linejoin="round">
      <circle cx="${f1(X(cx) - SHORT[r.id].length * (r.area_table < 6 ? 12 : 15) * 0.31 - 14)}" cy="${f1(Y(cy) - 3)}" r="11" fill="#1F6F5F" stroke="none"/>
      <text x="${f1(X(cx) - SHORT[r.id].length * (r.area_table < 6 ? 12 : 15) * 0.31 - 14)}" y="${f1(Y(cy) + 2)}" font-size="13" font-weight="700" text-anchor="middle" fill="#FFFFFF" stroke="none">${k + 1}</text>
      <text x="${f1(X(cx))}" y="${f1(Y(cy) + 2)}" font-size="${r.area_table < 6 ? 12 : 15}" font-weight="700" text-anchor="middle" fill="#1E1B18">${SHORT[r.id]}</text>
      <text x="${f1(X(cx))}" y="${f1(Y(cy) + 19)}" font-size="${r.area_table < 6 ? 12 : 14}" text-anchor="middle" fill="#1E1B18">${fmt(r.area_table)} м²</text></g>`);
  } else {
    svg.push(`<g paint-order="stroke" stroke="#F1EFEB" stroke-width="4"><text x="${f1(X(cx))}" y="${f1(Y(cy) + 4)}" font-size="${r.area_table < 6 ? 11 : 13}" text-anchor="middle" fill="#8C857B">${r.id === "R8" ? "крыльцо" : "не убирать"}</text></g>`);
  }
}
const planSvg = `<svg viewBox="0 0 ${f1(W)} ${f1(Hh)}" style="display:block;height:118mm;width:auto;margin:0 auto">${svg.join("\n")}</svg>`;

// ---------- таблица ----------
const rows = CLEAN.map((c, i) => {
  const r = room[c.id], g = glass(c.id), stuff = inside(c.id);
  const extra = [];
  if (extDoor(c.id)) extra.push("входная дверь");
  if (g.n) extra.push(`${c.id === "R1" ? "окна и стеклянная дверь" : "окно"}: ${g.n} шт., ≈ ${fmt(g.a, 1)} м² стекла`);
  return `<tr><td class="n"><b>${i + 1}</b></td><td><b>${c.name}</b><div class="s">${[...stuff, ...extra].join(" · ") || "пол, плинтусы, двери"}</div></td><td class="a">${fmt(r.area_table)}</td></tr>`;
}).join("");
const totalGlass = CLEAN.reduce((s, c) => s + glass(c.id).a, 0);

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 210mm; height: 297mm; background: #fff; font-family: Inter, sans-serif; color: #1E1B18; }
.p { width: 210mm; height: 297mm; padding: 13mm 14mm 11mm; display: flex; flex-direction: column; }
.k { font-size: 3mm; font-weight: 700; letter-spacing: .5mm; color: #1F6F5F; text-transform: uppercase; }
.t { font-size: 9mm; font-weight: 700; letter-spacing: -0.2mm; margin-top: 1.5mm; }
.d { font-size: 3.5mm; color: #5E574E; margin-top: 1.5mm; }
.big { display: flex; align-items: baseline; gap: 3mm; margin-top: 4mm; }
.big b { font-size: 11mm; letter-spacing: -0.3mm; color: #1F6F5F; }
.big span { font-size: 3.6mm; color: #3A3530; }
.plan { margin-top: 4mm; border: 0.3mm solid #E2DED7; border-radius: 3mm; padding: 3mm; }
.leg { display: flex; gap: 6mm; font-size: 3mm; color: #3A3530; margin-top: 2mm; }
.leg i { display: inline-block; width: 4mm; height: 3mm; border-radius: 0.8mm; vertical-align: -0.4mm; margin-right: 1.5mm; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; font-size: 3.4mm; }
th { text-align: left; font-size: 2.7mm; color: #5E574E; font-weight: 700; text-transform: uppercase; letter-spacing: .3mm; padding: 1.6mm 2mm; border-bottom: 0.4mm solid #1E1B18; }
td { padding: 2mm; border-bottom: 0.25mm solid #E2DED7; vertical-align: top; }
td.n b { display: inline-flex; width: 5.5mm; height: 5.5mm; border-radius: 50%; background: #1F6F5F; color: #fff; font-size: 3mm; align-items: center; justify-content: center; }
td.a, th.a { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.a { font-weight: 700; }
.s { font-size: 2.9mm; color: #5E574E; margin-top: 0.6mm; line-height: 1.35; }
tfoot td { border-bottom: 0; border-top: 0.4mm solid #1E1B18; font-weight: 700; font-size: 3.8mm; }
.note { margin-top: auto; font-size: 2.8mm; color: #5E574E; line-height: 1.45; }
</style></head><body><div class="p">
  <div class="k">План уборки</div>
  <div class="t">${plan.meta.title}</div>
  <div class="d">${plan.meta.address_short} · уборка по номерам от входа</div>
  <div class="big"><b>${fmt(total)} м²</b><span>убираем: ${CLEAN.length} помещений из ${plan.rooms.length - 1}</span></div>
  <div class="plan">${planSvg}
    <div class="leg"><span><i style="background:#BFE3DA"></i>убираем</span><span><i style="background:repeating-linear-gradient(45deg,#F1EFEB 0 1.2mm,#DEDAD3 1.2mm 1.8mm)"></i>не убираем: спальни, гардеробная, котельная</span><span><i style="background:#CFE3EE"></i>окна</span></div>
  </div>
  <table><thead><tr><th style="width:9mm">№</th><th>Помещение и что внутри</th><th class="a">Площадь, м²</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td></td><td>Итого к уборке${totalGlass ? ` · стекла ≈ ${fmt(totalGlass, 1)} м² с одной стороны` : ""}</td><td class="a">${fmt(total)}</td></tr></tfoot>
  </table>
  <div class="note">Площади пола — по экспликации проекта. Кухня-гостиная — одно помещение, кухонная зона входит в ${fmt(room.R1.area_table)} м².
  Площадь стекла посчитана по проёмам (окна 0,59–2,42 м от пола) с одной стороны, рамы не учтены — примерно.</div>
</div></body></html>`;
fs.writeFileSync(path.join(DIR, "cleaning-plan.html"), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2.5 });
await page.goto("file://" + path.join(DIR, "cleaning-plan.html"));
await page.waitForLoadState("networkidle");
await page.pdf({ path: path.join(DIR, "cleaning-plan.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await page.screenshot({ path: path.join(DIR, "cleaning-plan.png") });
await browser.close();
console.log("total", total.toFixed(2), CLEAN.map((c) => `${c.id}:${room[c.id].area_table} glass ${glass(c.id).n}/${glass(c.id).a.toFixed(2)}`).join(" | "));
