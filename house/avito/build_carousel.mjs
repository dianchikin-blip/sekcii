// Карусель для Авито: 8 слайдов 1600×1200 (4:3) из обезличенных кадров проекта.
// Запуск: node build_carousel.mjs  →  slides/slide-01.png … slide-08.png
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const DIR = path.dirname(new URL(import.meta.url).pathname);
const plan = JSON.parse(fs.readFileSync(path.join(DIR, "plan-anon.json"), "utf8"));
const fr = (n) => `frames/${n}.png`;
const zones = plan.zoning.zones.map((z) => ({ ...z, a: z.rooms.reduce((s, id) => s + plan.rooms.find((r) => r.id === id).area_table, 0) }));
const total = plan.area_summary.total_table_stated;
const pct = (a) => ((a / total) * 100).toFixed(1).replace(".", ",");
const num = (n, d = 2) => n.toFixed(d).replace(".", ",");

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1600px; height: 1200px; background: #F3F0EA; font-family: Inter, sans-serif; color: #1E1B18; overflow: hidden; }
.s { position: relative; width: 1600px; height: 1200px; padding: 88px 96px; }
.k { font-size: 26px; font-weight: 700; letter-spacing: .16em; color: #8A6230; text-transform: uppercase; }
.h { font-size: 84px; font-weight: 700; letter-spacing: -0.035em; line-height: 1.02; margin-top: 22px; }
.h.m { font-size: 68px; }
.p { font-size: 34px; line-height: 1.38; color: #4A443D; margin-top: 28px; }
.ph { position: absolute; border-radius: 22px; overflow: hidden; box-shadow: 0 24px 60px rgba(30,27,24,.16); background: #fff; }
.ph img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.li { display: flex; gap: 22px; align-items: flex-start; font-size: 34px; line-height: 1.3; margin-top: 30px; }
.li i { flex: 0 0 18px; height: 18px; border-radius: 50%; background: #8A6230; margin-top: 12px; }
.pill { display: inline-block; font-size: 28px; font-weight: 700; padding: 14px 26px; border-radius: 999px; background: #1E1B18; color: #fff; }
.no { position: absolute; right: 96px; top: 92px; font-size: 26px; font-weight: 700; color: #A39B8F; letter-spacing: .08em; }
.ex { margin-top: 40px; padding: 26px 30px; border-left: 6px solid #8A6230; background: #FBF9F5; border-radius: 0 14px 14px 0; font-size: 30px; line-height: 1.4; color: #3A3530; }
.ex b { color: #1E1B18; }
`;
const slide = (n, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s">${body}${n > 1 ? `<div class="no">${n} / 8</div>` : ""}</div></body></html>`;
// портретный кадр 1080×1920 → рамка ширины w (обрезаем шапку сверху, если нужно)
const photo = (src, x, y, w, h, crop = 0) => `<div class="ph" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="${src}" style="object-position:50% ${crop}%"></div>`;

const S = [];
// 1. Обложка
S.push(slide(1, `
  <div style="width:760px">
    <div class="k">Визуализация планировки</div>
    <div class="h">Ваш дом —<br>понятный<br>за 30 секунд</div>
    <div class="p">Короткие видео и схемы по плану:<br>солнце, зоны, маршруты, тени</div>
    <div style="margin-top:48px"><span class="pill">6 видео + лист А3</span></div>
  </div>
  ${photo(fr("axo"), 880, 120, 300, 534)}
  ${photo(fr("zoning"), 1010, 360, 300, 534)}
  ${photo(fr("routes"), 1200, 580, 300, 534)}
`));
// 2. Проблема → решение
S.push(slide(2, `
  <div style="width:820px">
    <div class="k">Зачем это нужно</div>
    <div class="h m">Чертёж понятен архитектору.<br>Покупателю — нет.</div>
    <div class="li"><i></i><span>Люди листают объявления и не читают планы с размерами</span></div>
    <div class="li"><i></i><span>Видео за 30 секунд показывает, как в доме живётся</span></div>
    <div class="li"><i></i><span>Всё строится по вашему плану — без выдуманных деталей</span></div>
  </div>
  ${photo(fr("poche"), 1000, 150, 500, 889, 8)}
`));
// 3. Что входит
const items = [["axo", "Дом по слоям"], ["section", "Солнце и воздух"], ["poche", "План дома"], ["zoning", "Зонирование"], ["routes", "Маршруты"], ["shadows", "Солнце и тени"]];
S.push(slide(3, `
  <div class="k">Что вы получаете</div>
  <div class="h m">Шесть видео по 3 секунды<br>и общий ролик на 30 секунд</div>
  <div style="position:absolute;left:96px;right:96px;top:380px;display:grid;grid-template-columns:repeat(6,1fr);gap:22px">
    ${items.map(([f, t], i) => `<div><div class="ph" style="position:relative;width:100%;aspect-ratio:9/16"><img src="${fr(f)}" style="object-fit:contain"></div>
      <div style="font-size:26px;font-weight:700;margin-top:16px"><span style="color:#8A6230">0${i + 1}</span> ${t}</div></div>`).join("")}
  </div>
  <div style="position:absolute;left:96px;bottom:70px;font-size:28px;color:#4A443D">+ лист А3 со всеми схемами в PDF · вертикальный формат для Авито, сайта и сторис</div>
`));
// 4. Дом по слоям
S.push(slide(4, `
  <div style="width:780px">
    <div class="k">01 · Дом по слоям</div>
    <div class="h m">Пол, стены и крыша —<br>по отдельности</div>
    <div class="li"><i></i><span>Каждая комната подписана, видна её площадь</span></div>
    <div class="li"><i></i><span>Окна и двери стоят на своих местах</span></div>
    <div class="li"><i></i><span>Слои собираются в дом прямо в видео</span></div>
  </div>
  ${photo(fr("axo"), 980, 110, 520, 924, 6)}
`));
// 5. Солнце и воздух
S.push(slide(5, `
  <div style="width:800px">
    <div class="k">02 · Солнце и воздух</div>
    <div class="h m">Сколько солнца<br>попадает в комнаты</div>
    <div class="li"><i></i><span>Считаю высоту солнца для вашего города летом и зимой</span></div>
    <div class="li"><i></i><span>Показываю, как дом проветривается насквозь</span></div>
    <div class="ex">В примере: летом солнце заходит в спальню на <b>1,05 м</b>, зимой — <b>через всю комнату</b></div>
  </div>
  ${photo(fr("section"), 990, 110, 510, 906, 0)}
`));
// 6. Зоны и маршруты
const [dz, nz, sz] = zones;
S.push(slide(6, `
  <div style="width:640px">
    <div class="k">03–05 · План, зоны, маршруты</div>
    <div class="h m">Где день,<br>где ночь<br>и сколько идти</div>
    <div class="ex">В примере ${num(total, 0)} м²: <b>${pct(dz.a)} %</b> — дневная зона, <b>${pct(nz.a)} %</b> — спальни, <b>${pct(sz.a)} %</b> — санузлы и проходы.<br>От спальни до кухни — <b>14,81 м</b>.</div>
  </div>
  ${photo(fr("zoning"), 800, 110, 340, 604, 12)}
  ${photo(fr("routes"), 1160, 300, 340, 604, 12)}
`));
// 7. Тени + кому подходит
S.push(slide(7, `
  <div style="width:820px">
    <div class="k">06 · Солнце и тени</div>
    <div class="h m">Как солнце обходит<br>дом за день</div>
    <div class="p" style="font-size:30px">Тень с 8 до 18 часов, время восхода и заката для вашего города</div>
    <div style="margin-top:56px;font-size:30px;font-weight:700">Кому подходит</div>
    <div class="li" style="font-size:30px;margin-top:20px"><i></i><span><b>Строителям и застройщикам</b> — каталог проектов, который смотрят</span></div>
    <div class="li" style="font-size:30px;margin-top:16px"><i></i><span><b>Риелторам</b> — объявление, которое выделяется</span></div>
    <div class="li" style="font-size:30px;margin-top:16px"><i></i><span><b>Тем, кто строит дом</b> — понять проект до начала стройки</span></div>
  </div>
  ${photo(fr("shadows"), 1000, 110, 500, 889, 4)}
`));
// 8. Как заказать
S.push(slide(8, `
  <div class="k">Как заказать</div>
  <div class="h m">Три шага</div>
  <div style="position:absolute;left:96px;right:96px;top:330px;display:grid;grid-template-columns:repeat(3,1fr);gap:36px">
    ${[["1", "Пришлите план", "PDF проекта или чёткое фото. И город, где будет дом"], ["2", "Я уточню детали", "Высоту стен, крышу, стороны света — то, чего нет на плане"], ["3", "Получите файлы", "6 видео, ролик на 30 секунд и лист А3 в PDF"]]
      .map(([n, t, d]) => `<div style="background:#FFFFFF;border-radius:22px;padding:44px 40px;box-shadow:0 18px 50px rgba(30,27,24,.08);min-height:380px">
        <div style="font-size:80px;font-weight:700;color:#8A6230;line-height:1">${n}</div>
        <div style="font-size:40px;font-weight:700;margin-top:26px;letter-spacing:-0.01em">${t}</div>
        <div style="font-size:30px;line-height:1.38;color:#4A443D;margin-top:16px">${d}</div></div>`).join("")}
  </div>
  <div style="position:absolute;left:96px;right:96px;bottom:84px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:38px;line-height:1.35">Напишите в сообщения —<br><b>посчитаю стоимость под ваш план</b></div>
    <div style="font-size:30px;color:#8A6230;font-weight:700;text-align:right">Пример — в фото выше<br>и в видео по запросу</div>
  </div>
`));

fs.mkdirSync(path.join(DIR, "slides"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
for (let i = 0; i < S.length; i++) {
  const f = path.join(DIR, `slide-${String(i + 1).padStart(2, "0")}.html`);
  fs.writeFileSync(f, S[i]);
  await page.goto("file://" + f);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(DIR, "slides", `slide-${String(i + 1).padStart(2, "0")}.png`) });
  fs.unlinkSync(f);
}
await browser.close();
console.log("slides:", S.length);
