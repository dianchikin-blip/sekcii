// Монтаж: титул → шесть роликов (с паузой на последнем кадре и мягкими переходами) → лист А3.
// Запуск: node build.mjs  (ролики и кадры лежат в assets/)
import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
const CH = [
  { id: "axo", name: "Разнесённая аксонометрия" },
  { id: "section", name: "Разрез, солнце, проветривание" },
  { id: "poche", name: "Поше-план" },
  { id: "zoning", name: "Зонирование" },
  { id: "routes", name: "Маршруты по дому" },
  { id: "shadows", name: "Этюд теней" },
];
const INTRO = 3.3, CLIP = 3.0, HOLD = 0.9, STEP = 3.7, FADE = 0.25, OUTRO = 4.8;
CH.forEach((c, i) => (c.s = INTRO - 0.2 + i * STEP));
const lastEnd = CH.at(-1).s + CLIP + HOLD;
const OUT0 = lastEnd - 0.2, TOTAL = +(OUT0 + OUTRO).toFixed(2);

let z = 2;
const media = CH.map((c) => `
      <video id="v-${c.id}" class="clip" src="assets/${c.id}.mp4" muted playsinline data-start="${c.s.toFixed(2)}" data-duration="${CLIP}" data-track-index="${1 + (z % 2)}"
        style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:contain;z-index:${z++}"></video>
      <img id="h-${c.id}" class="clip" src="assets/${c.id}-last.png" alt="" data-start="${(c.s + CLIP).toFixed(2)}" data-duration="${HOLD}" data-track-index="${3 + (z % 3)}"
        style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:contain;z-index:${z++}">`).join("");

const html = `<!doctype html>
<html lang="ru" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #F3F0EA; font-family: "Inter", sans-serif; color: #1E1B18; }
      #bg { position: absolute; inset: 0; background: #F3F0EA; }
      #intro, #outro { position: absolute; inset: 0; background: #F3F0EA; }
      #intro-in { position: absolute; left: 80px; right: 80px; top: 560px; }
      .k { font-size: 24px; font-weight: 700; letter-spacing: .16em; color: #8A6230; }
      .t { font-size: 104px; font-weight: 700; letter-spacing: -0.035em; line-height: 0.98; margin-top: 22px; }
      .d { font-size: 30px; color: #5E574E; margin-top: 26px; line-height: 1.35; }
      .list { margin-top: 64px; border-top: 2px solid #1E1B18; }
      .li { display: flex; gap: 22px; align-items: baseline; font-size: 30px; padding: 16px 0; border-bottom: 1px solid #D8D1C5; }
      .li b { font-size: 20px; color: #8A6230; letter-spacing: .1em; width: 40px; }
      #bar { position: absolute; left: 40px; right: 40px; top: 30px; display: flex; gap: 8px; z-index: 100; }
      .seg { flex: 1; height: 6px; border-radius: 3px; background: #DDD6CA; overflow: hidden; }
      .seg i { display: block; height: 100%; background: #1E1B18; transform-origin: 0% 50%; transform: scaleX(0); }
      #chap { position: absolute; right: 40px; top: 46px; font-size: 28px; font-weight: 700; letter-spacing: .08em; color: #5E574E; z-index: 100; font-variant-numeric: tabular-nums; }
      #sheet { position: absolute; left: 90px; top: 250px; width: 900px; box-shadow: 0 30px 80px rgba(30, 27, 24, .18); }
      #outro-cap { position: absolute; left: 80px; right: 80px; top: 92px; }
      #outro-cap .t { font-size: 64px; }
      #outro-foot { position: absolute; left: 80px; right: 80px; bottom: 120px; font-size: 24px; color: #5E574E; line-height: 1.45; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <div id="bg"></div>
      <div id="intro" class="clip" data-composition-id="intro" data-composition-src="compositions/intro.html" data-start="0" data-duration="${INTRO + 0.05}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920" style="z-index:1"></div>
      ${media}
      <div id="outro" class="clip" data-composition-id="outro" data-composition-src="compositions/outro.html" data-start="${OUT0.toFixed(2)}" data-duration="${OUTRO}" data-track-index="4" data-track-kind="graphics" data-width="1080" data-height="1920" style="z-index:${z++}"></div>
      <div id="bar">${CH.map((c) => `<div class="seg"><i id="p-${c.id}"></i></div>`).join("")}</div>
      <div id="chap"></div>
    </div>
    <script>
      (function () {
        const CH = ${JSON.stringify(CH.map((c) => ({ id: c.id, s: +c.s.toFixed(2) })))};
        const STEP = ${STEP}, FADE = ${FADE}, OUT0 = ${OUT0.toFixed(2)};
        const tl = gsap.timeline({ paused: true });
        for (const c of CH) tl.fromTo("#v-" + c.id, { opacity: 0 }, { opacity: 1, duration: FADE, ease: "power1.out" }, c.s);
        // прогресс и номер главы — функция времени
        const chap = document.getElementById("chap"), segs = CH.map((c) => document.getElementById("p-" + c.id));
        const bar = document.getElementById("bar");
        function paint() {
          const t = tl.time();
          let cur = -1;
          CH.forEach((c, i) => {
            const p = Math.min(1, Math.max(0, (t - c.s) / STEP));
            segs[i].style.transform = "scaleX(" + p.toFixed(4) + ")";
            if (t >= c.s) cur = i;
          });
          const show = cur >= 0 && t < OUT0;
          bar.style.opacity = show ? 1 : 0; chap.style.opacity = show ? 1 : 0;
          chap.textContent = cur >= 0 ? "0" + (cur + 1) + " / 0" + CH.length : "";
        }
        tl.fromTo({ v: 0 }, { v: 0 }, { v: 1, duration: ${TOTAL}, ease: "none", onUpdate: paint }, 0);
        window.__timelines = window.__timelines || {};
        window.__timelines["main"] = tl;
      })();
    </script>
  </body>
</html>
`;
fs.writeFileSync(new URL("./index.html", import.meta.url), html);
const area = String(plan.area_summary.total_table_stated.toFixed(2)).replace(".", ",");
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/intro.html", import.meta.url), `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #1E1B18; }
    #in-box { position: absolute; left: 80px; right: 80px; top: 560px; }
    #in-box .k { font-size: 28px; font-weight: 700; letter-spacing: .16em; color: #8A6230; }
    #in-box .t { font-size: 104px; font-weight: 700; letter-spacing: -0.035em; line-height: 0.98; margin-top: 22px; }
    #in-box .d { font-size: 30px; color: #5E574E; margin-top: 26px; line-height: 1.35; }
    #in-box .list { margin-top: 64px; border-top: 2px solid #1E1B18; }
    #in-box .li { display: flex; gap: 22px; align-items: baseline; font-size: 30px; padding: 16px 0; border-bottom: 1px solid #D8D1C5; }
    #in-box .li b { font-size: 28px; color: #8A6230; letter-spacing: .06em; width: 52px; }
  </style>
  <div id="root" data-composition-id="intro" data-width="1080" data-height="1920">
    <div id="in-box">
      <div class="k">${plan.meta.kicker}</div>
      <div class="t">${plan.meta.title}</div>
      <div class="d">Шесть чертежей из одного plan.json · ${area} м²</div>
      <div class="list">${CH.map((c, i) => `<div class="li"><b>0${i + 1}</b>${c.name}</div>`).join("")}</div>
    </div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#in-box .t", { scale: 1 }, { scale: 1.015, duration: 3.3, ease: "none", transformOrigin: "0% 50%" }, 0);
      tl.fromTo("#in-box .li", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out", stagger: 0.08 }, 0.3);
      window.__timelines = window.__timelines || {};
      window.__timelines["intro"] = tl;
    })();
  </script>
</template>
`);
fs.writeFileSync(new URL("./compositions/outro.html", import.meta.url), `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #1E1B18; }
    #out-cap { position: absolute; left: 80px; right: 80px; top: 92px; }
    #out-cap .k { font-size: 28px; font-weight: 700; letter-spacing: .16em; color: #8A6230; }
    #out-cap .t { font-size: 64px; font-weight: 700; letter-spacing: -0.03em; margin-top: 14px; }
    #out-sheet { position: absolute; left: 120px; top: 250px; width: 840px; box-shadow: 0 30px 80px rgba(30, 27, 24, .18); }
    #out-foot { position: absolute; left: 80px; right: 80px; bottom: 110px; font-size: 28px; color: #5E574E; line-height: 1.45; }
  </style>
  <div id="root" data-composition-id="outro" data-width="1080" data-height="1920">
    <div id="out-cap"><div class="k">ЛИСТ А3 · ${plan.meta.code}</div><div class="t">Всё на одном листе</div></div>
    <img id="out-sheet" src="assets/sheet.png" alt="Лист А3">
    <div id="out-foot">Аксонометрия, разрез, поше-план, зонирование, маршруты и тени — собраны по одному плану.<br>Условное отмечено на каждом чертеже.</div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#root", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 0);
      tl.fromTo("#out-sheet", { scale: 1.12, y: 60, transformOrigin: "50% 0%" }, { scale: 1, y: 0, duration: 1.6, ease: "power3.out" }, 0);
      tl.fromTo("#out-cap, #out-foot", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.15 }, 0.3);
      window.__timelines = window.__timelines || {};
      window.__timelines["outro"] = tl;
    })();
  </script>
</template>
`);
console.log("total", TOTAL, CH.map((c) => c.id + "@" + c.s.toFixed(2)).join(" "), "outro@", OUT0.toFixed(2));
