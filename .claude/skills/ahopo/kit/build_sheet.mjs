// Собирает все чертежи проекта на один лист А3 (последний кадр каждого ролика) → sheet.pdf + sheet.png.
// Запуск из папки проекта:  node sheet/build_sheet.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan.json"), "utf8"));
const OUT = path.join(ROOT, "sheet");
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });

// чертежи: папка, файл ролика, название; масштаб берём из генератора (const S = …), у аксонометрии масштаба нет
const DRAWINGS = [
  { dir: "axo-video", mp4: ["axo.mp4", "axo-shigali.mp4"], name: "Разнесённая аксонометрия", noScale: true },
  { dir: "section-video", mp4: ["section.mp4", "section-1-1.mp4"], name: "Разрез 1-1, солнце и проветривание" },
  { dir: "poche-video", mp4: ["poche.mp4"], name: "Поше-план" },
  { dir: "zoning-video", mp4: ["zoning.mp4"], name: "Зонирование" },
  { dir: "routes-video", mp4: ["routes.mp4"], name: "Маршруты по дому" },
  { dir: "shadows-video", mp4: ["shadows.mp4"], name: "Этюд теней" },
].map((d) => ({ ...d, mp4: d.mp4.find((m) => fs.existsSync(path.join(ROOT, d.dir, m))) })).filter((d) => d.mp4);
if (plan.shadow_study) {
  const [, mm, dd] = plan.shadow_study.date.split("-").map(Number);
  const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  for (const d of DRAWINGS) if (d.dir === "shadows-video") d.name += `, ${dd} ${MON[mm - 1]}`;
}

for (const d of DRAWINGS) {
  const png = path.join(OUT, "frames", `${d.dir}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.05", "-i", path.join(ROOT, d.dir, d.mp4), "-frames:v", "1", "-update", "1", png]);
  d.png = `frames/${d.dir}.png`;
  const src = fs.readFileSync(path.join(ROOT, d.dir, "build.mjs"), "utf8");
  const m = /const S = (\d+(?:\.\d+)?)/.exec(src);
  d.S = d.noScale || !m ? null : +m[1];
}

// лист А3, книжная ориентация, мм
const A3W = 297, A3H = 420, M = 8, GAP = 5, COLS = 3;
const cellW = (A3W - 2 * M - (COLS - 1) * GAP) / COLS;
const imgH = (cellW * 1920) / 1080;
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",");
const bar = (S, label) => {
  if (!S) return `<div class="nb">без масштаба</div>`;
  const mmPerM = (S * cellW) / 1080;          // мм листа на 1 м натуры
  const segs = [0, 1, 2, 3, 4].map((i) => `<i style="width:${mmPerM}mm;background:${i % 2 ? "#fff" : "#111"}"></i>`).join("");
  return `<div class="sb"><div class="bar">${segs}</div><span>0 · 5 м · 1 м = ${fmt(mmPerM, 1)} мм${label ? " · " + label : ""}</span></div>`;
};
const cells = DRAWINGS.map((d, i) => `
  <div class="cell">
    <div class="cap"><b>${i + 1}</b>${d.name}</div>
    <div class="frame"><img src="${d.png}"></div>
    ${bar(d.S)}
  </div>`).join("");

const cond = [];
for (const a of plan.assumptions) if (/условно|допущение/i.test(a.status || "")) cond.push(a.topic.toLowerCase());
if (plan.site) cond.push(`координаты: ${plan.site.city}`);
if (plan.zoning) cond.push("отнесение помещений к зонам");
if (plan.zones) for (const z of plan.zones) if (/условно/.test(z.note || "")) cond.push(`точка «${z.name}»`);
if (plan.shadow_study) cond.push(`стены ${fmt(plan.shadow_study.wall_height)} м в этюде теней`);
cond.push("ширины дверей со знаком ≈");
const poche = DRAWINGS.find((d) => d.dir === "poche-video");

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  @page { size: A3; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${A3W}mm; height: ${A3H}mm; background: #fff; font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #111; }
  .sheet { position: relative; width: ${A3W}mm; height: ${A3H}mm; padding: ${M}mm; }
  .sheet::before { content: ""; position: absolute; inset: 4mm; border: 0.5mm solid #111; pointer-events: none; }
  .grid { display: grid; grid-template-columns: repeat(${COLS}, ${cellW}mm); column-gap: ${GAP}mm; row-gap: 3mm; }
  .cell { display: flex; flex-direction: column; }
  .cap { font-size: 3.1mm; font-weight: 700; height: 6mm; display: flex; align-items: center; gap: 2mm; }
  .cap b { display: inline-flex; width: 4.6mm; height: 4.6mm; border-radius: 50%; background: #111; color: #fff; font-size: 2.6mm; align-items: center; justify-content: center; }
  .frame { border: 0.35mm solid #111; width: ${cellW}mm; height: ${imgH}mm; overflow: hidden; }
  .frame img { width: 100%; height: 100%; display: block; }
  .sb, .nb { height: 6mm; display: flex; align-items: center; gap: 2mm; font-size: 2.3mm; color: #444; }
  .bar { display: flex; border: 0.25mm solid #111; height: 1.6mm; }
  .bar i { display: block; height: 100%; }
  .stamp { position: absolute; left: ${M}mm; right: ${M}mm; bottom: ${M}mm; height: 52mm; border: 0.5mm solid #111; display: grid; grid-template-columns: 1.25fr 1fr 1fr; }
  .stamp > div { padding: 3mm 4mm; border-right: 0.3mm solid #111; }
  .stamp > div:last-child { border-right: 0; }
  .k { font-size: 2.4mm; font-weight: 700; letter-spacing: .4mm; color: #8A6230; }
  .t { font-size: 7mm; font-weight: 700; letter-spacing: -0.1mm; margin-top: 1.5mm; }
  .a { font-size: 2.7mm; color: #444; margin-top: 1mm; }
  .h { font-size: 2.6mm; font-weight: 700; text-transform: uppercase; letter-spacing: .3mm; margin-bottom: 1.6mm; }
  ol { font-size: 2.8mm; line-height: 1.5; padding-left: 4.5mm; }
  .c { font-size: 2.55mm; line-height: 1.45; color: #333; }
  .c b { color: #9A4322; }
  .bigbar { margin-top: 3mm; }
  .bigbar .bar { height: 2.2mm; }
  .bigbar span { font-size: 2.4mm; color: #444; display: block; margin-top: 1mm; }
  .src { font-size: 2.3mm; color: #666; margin-top: 2.5mm; }
</style></head><body><div class="sheet">
  <div class="grid">${cells}</div>
  <div class="stamp">
    <div>
      <div class="k">${plan.meta.code} · ЛИСТ ЧЕРТЕЖЕЙ А3</div>
      <div class="t">${plan.meta.title}</div>
      <div class="a">${plan.meta.address_short}</div>
      <div class="a">Общая площадь ${fmt(plan.area_summary.total_table_stated)} м² · ${plan.rooms.length} помещений</div>
      <div class="bigbar">${poche ? `<div class="bar">${[0, 1, 2, 3, 4].map((i) => `<i style="width:${(poche.S * cellW) / 1080}mm;background:${i % 2 ? "#fff" : "#111"}"></i>`).join("")}</div><span>Линейка 0–5 м к поше-плану (№ ${DRAWINGS.indexOf(poche) + 1}); у каждого чертежа своя линейка под рамкой</span>` : ""}</div>
    </div>
    <div><div class="h">Чертежи</div><ol>${DRAWINGS.map((d) => `<li>${d.name}</li>`).join("")}</ol></div>
    <div><div class="h">Взято условно</div><div class="c"><b>Условно:</b> ${cond.join("; ")}.</div>
      <div class="src">Все чертежи построены только из plan.json. Кадры — последние кадры роликов HyperFrames.</div></div>
  </div>
</div></body></html>`;
fs.writeFileSync(path.join(OUT, "sheet.html"), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.round((A3W / 25.4) * 96), height: Math.round((A3H / 25.4) * 96) }, deviceScaleFactor: 3 });
await page.goto("file://" + path.join(OUT, "sheet.html"));
await page.waitForLoadState("networkidle");
await page.pdf({ path: path.join(OUT, "sheet.pdf"), format: "A3", printBackground: true, preferCSSPageSize: true });
await page.screenshot({ path: path.join(OUT, "sheet.png"), fullPage: false });
await browser.close();
console.log("drawings:", DRAWINGS.map((d) => `${d.dir}${d.S ? " S=" + d.S : ""}`).join(", "));
