// Генерирует compositions/cut.html — архитектурный разрез 1-1 — СТРОГО из ../plan.json.
// Запуск: node build.mjs
import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync(new URL("../plan.json", import.meta.url), "utf8"));
const A = Object.fromEntries(plan.assumptions.map((a) => [a.id, a]));
const H = A["A-heights"].value;
const FF = H.finished_floor;                 // +0,120 — по разрезу
const TOP = H.wall_top;                      // 2,952 — условно
const SILL = H.window_sill, HEAD = H.window_head;   // 0,59 / 2,42 — по разрезу
const DOOR = H.door_head;                    // 2,10 — условно
const ROOF_T = A["A-roof-render"].value.thickness;  // 0,30 — условно
const SLAB = +(/плиты[^0-9]*(\d+)/.exec(A["A-floor"].value.join(" "))[1]) / 1000; // 0,160
const [GRADE, FND, PILE] = H.foundation_marks;      // -0,375 / -1,175 / -2,675
const sec = plan.sections[0];
const path = sec.path;
const LAT = plan.site.latitude, DECL = 23.44;
const hSummer = 90 - LAT + DECL, hWinter = 90 - LAT - DECL;
const rad = (d) => (d * Math.PI) / 180;
const tS = Math.tan(rad(hSummer)), tW = Math.tan(rad(hWinter));

const W = 1080, HH = 1920;
const fmt = (n, d = 2) => n.toFixed(d).replace(".", ",").replace("-", "−");
const f = (n) => n.toFixed(1);

// ---------- разрезаемые элементы по ступенчатой линии ----------
const segs = [];
for (let i = 0; i + 1 < path.length; i++) {
  const [x1, y1] = path[i], [x2, y2] = path[i + 1];
  if (Math.abs(x1 - x2) < 1e-9) segs.push({ x: x1, y0: Math.min(y1, y2), y1: Math.max(y1, y2) });
}
const horizWalls = plan.walls.filter((w) => Math.abs(w.a[1] - w.b[1]) < 1e-9);
const vertWalls = plan.walls.filter((w) => Math.abs(w.a[0] - w.b[0]) < 1e-9);
const cuts = []; // {y0,y1,kind,thickness,open:{z0,z1,type}|null, segX}
for (const s of segs) {
  for (const w of horizWalls) {
    const xa = Math.min(w.a[0], w.b[0]), xb = Math.max(w.a[0], w.b[0]);
    if (s.x < xa || s.x > xb) continue;
    const yy0 = w.a[1] - w.thickness / 2, yy1 = w.a[1] + w.thickness / 2;
    if (yy1 < s.y0 || yy0 > s.y1) continue;
    const op = plan.openings.find((o) => o.wall.split("/").includes(w.id) && Math.abs(o.a[1] - o.b[1]) < 1e-9 &&
      s.x >= Math.min(o.a[0], o.b[0]) && s.x <= Math.max(o.a[0], o.b[0]));
    cuts.push({ y0: yy0, y1: yy1, wall: w, op, x: s.x });
  }
  // проёмы без стены на линии (проход A1)
  for (const o of plan.openings) {
    if (Math.abs(o.a[1] - o.b[1]) > 1e-9) continue;
    if (s.x < Math.min(o.a[0], o.b[0]) || s.x > Math.max(o.a[0], o.b[0])) continue;
    if (o.a[1] < s.y0 || o.a[1] > s.y1) continue;
    if (cuts.some((c) => c.op === o)) continue;
    const w = plan.walls.find((ww) => o.wall.split("/").includes(ww.id));
    cuts.push({ y0: o.a[1] - w.thickness / 2, y1: o.a[1] + w.thickness / 2, wall: w, op: o, x: s.x });
  }
  for (const w of vertWalls) if (Math.abs(w.a[0] - s.x) < w.thickness / 2) throw new Error("линия идёт вдоль стены " + w.id);
}
cuts.sort((a, b) => a.y0 - b.y0);
const yS = cuts[0].y0, yN = cuts[cuts.length - 1].y1;  // наружные грани по линии

// помещения между разрезанными стенами
const inPoly = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const xAt = (y) => (segs.find((s) => y >= s.y0 && y <= s.y1) || segs[0]).x;
const spaces = [];
for (let i = 0; i + 1 < cuts.length; i++) {
  const a = cuts[i].y1, b = cuts[i + 1].y0;
  if (b - a < 0.05) continue;
  const ym = (a + b) / 2;
  const room = plan.rooms.find((r) => inPoly([xAt(ym), ym], r.polygon));
  spaces.push({ y0: a, y1: b, room });
}

// ---------- экранная система: смотрим на восток → север слева, юг справа ----------
const S = 58;
const SX0 = 151;
const X = (y) => SX0 + (yN - y) * S;
const Z0 = 1310;                      // экранная отметка ±0,000
const Z = (z) => Z0 - z * S;
const yEdgeS = yS - (W - 30 - X(yS)) / S;   // правый край кадра в координатах y
const rectYZ = (y0, y1, z0, z1, extra = "") =>
  `<rect x="${f(X(Math.max(y0, y1)))}" y="${f(Z(Math.max(z0, z1)))}" width="${f(Math.abs(y1 - y0) * S)}" height="${f(Math.abs(z1 - z0) * S)}" ${extra}/>`;

// ---------- земля ----------
const ground = [];
const gTop = Z(GRADE), gBot = Z(PILE - 0.55);
ground.push(`<rect x="0" y="${f(gTop)}" width="${W}" height="${f(gBot - gTop)}" fill="url(#hatch)"/>`);
ground.push(`<rect x="${f(X(yN))}" y="${f(Z(-SLAB))}" width="${f((yN - yS) * S)}" height="${f(Z(GRADE) - Z(-SLAB))}" fill="url(#hatch)"/>`);
ground.push(`<line x1="0" y1="${f(gTop)}" x2="${W}" y2="${f(gTop)}" stroke="#23201C" stroke-width="2"/>`);

// ---------- разрез: чёрное ----------
const blk = [];
// плита пола и чистый пол
blk.push(rectYZ(yS, yN, -SLAB, 0, 'fill="#141414"'));
blk.push(rectYZ(yS, yN, 0, FF, 'fill="#8C857B"'));
// перекрытие/крыша (плоская — условно)
blk.push(rectYZ(yS, yN, TOP, TOP + ROOF_T, 'fill="#141414"'));
// стены и проёмы
const glass = [];
for (const c of cuts) {
  const o = c.op;
  if (!o) { blk.push(rectYZ(c.y0, c.y1, 0, TOP, 'fill="#141414"')); continue; }
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  const z0 = isWin ? SILL : 0, z1 = isWin ? HEAD : DOOR;
  if (z0 > 0) blk.push(rectYZ(c.y0, c.y1, 0, z0, 'fill="#141414"'));
  blk.push(rectYZ(c.y0, c.y1, z1, TOP, 'fill="#141414"'));
  if (isWin) {
    const ym = (c.y0 + c.y1) / 2;
    glass.push(`<line x1="${f(X(ym))}" y1="${f(Z(z0))}" x2="${f(X(ym))}" y2="${f(Z(z1))}" stroke="#4E8FB8" stroke-width="2"/>`);
    glass.push(`<line x1="${f(X(c.y0))}" y1="${f(Z(z0))}" x2="${f(X(c.y1))}" y2="${f(Z(z0))}" stroke="#141414" stroke-width="1"/>`);
  }
}
// фундаменты под наружными и несущими стенами (сечения — условно)
for (const c of cuts) {
  if (c.wall.kind === "partition") continue;
  const ym = (c.y0 + c.y1) / 2, wdt = Math.max(c.y1 - c.y0, 0.38);
  blk.push(rectYZ(ym - wdt / 2, ym + wdt / 2, FND, -SLAB, 'fill="#141414"'));
  blk.push(rectYZ(ym - 0.15, ym + 0.15, PILE, FND, 'fill="#141414"'));
}

// ---------- за разрезом: тонкие линии (смотрим на восток) ----------
const beyond = [];
const wallsRects = plan.walls.map((w) => {
  const t = w.thickness / 2;
  return { id: w.id, x0: Math.min(w.a[0], w.b[0]) - (Math.abs(w.a[0] - w.b[0]) < 1e-9 ? t : 0), x1: Math.max(w.a[0], w.b[0]) + (Math.abs(w.a[0] - w.b[0]) < 1e-9 ? t : 0),
    y0: Math.min(w.a[1], w.b[1]) - (Math.abs(w.a[1] - w.b[1]) < 1e-9 ? t : 0), y1: Math.max(w.a[1], w.b[1]) + (Math.abs(w.a[1] - w.b[1]) < 1e-9 ? t : 0) };
});
for (const o of plan.openings) {
  if (Math.abs(o.a[0] - o.b[0]) > 1e-9) continue;           // только проёмы в стенах «лицом к нам»
  const ox = o.a[0];
  const ya = Math.min(o.a[1], o.b[1]), yb = Math.max(o.a[1], o.b[1]), ym = (ya + yb) / 2;
  const s = segs.find((sg) => ym >= sg.y0 && ym <= sg.y1);
  if (!s || ox <= s.x) continue;
  const wid = o.wall;
  const blocked = wallsRects.some((r) => r.id !== wid && ym > r.y0 && ym < r.y1 && r.x1 > s.x && r.x0 < ox - 0.25);
  if (blocked) continue;
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  const z0 = isWin ? SILL : FF, z1 = isWin ? HEAD : DOOR;
  beyond.push(`<rect x="${f(X(yb))}" y="${f(Z(z1))}" width="${f((yb - ya) * S)}" height="${f((z1 - z0) * S)}" fill="none" stroke="#5C564E" stroke-width="1.2"/>`);
  if (isWin) beyond.push(`<line x1="${f(X(ym))}" y1="${f(Z(z0))}" x2="${f(X(ym))}" y2="${f(Z(z1))}" stroke="#5C564E" stroke-width="0.8"/>`);
  else beyond.push(`<line x1="${f(X(yb))}" y1="${f(Z(z1))}" x2="${f(X(ya) - 4)}" y2="${f(Z((z0 + z1) / 2))}" stroke="#5C564E" stroke-width="0.8" stroke-dasharray="4 3"/>`);
  if (isWin) beyond.push(`<text x="${f(X(ym))}" y="${f(Z(z0) + 17)}" font-size="12" text-anchor="middle" fill="#5C564E">окно за разрезом</text>`);
  else beyond.push(`<text x="${f(X(ym))}" y="${f(Z(z1) - 5)}" font-size="12" text-anchor="middle" fill="#5C564E">дверь за разрезом</text>`);
}
// линия потолка/стен за разрезом в каждом помещении
for (const sp of spaces) beyond.push(`<line x1="${f(X(sp.y1))}" y1="${f(Z(TOP))}" x2="${f(X(sp.y0))}" y2="${f(Z(TOP))}" stroke="#5C564E" stroke-width="0.6"/>`);

// подписи помещений
const roomLabels = spaces.filter((sp) => sp.room && sp.y1 - sp.y0 > 1).map((sp) => {
  const ym = (sp.y0 + sp.y1) / 2;
  const nm = sp.room.name.split(" (")[0];
  return `<text x="${f(X(ym))}" y="${f(Z(TOP) + 21)}" font-size="${sp.y1 - sp.y0 < 2.5 ? 16 : 18}" font-weight="700" text-anchor="middle" fill="#23201C">${nm}</text>`;
}).join("\n");

// ---------- размеры под землёй ----------
const dims = [];
const dimY = Z(PILE - 0.55) + 38, dimY2 = dimY + 52;
const ticks = [];
for (const c of cuts) ticks.push(c.y0, c.y1);
const tk = [...new Set(ticks.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
const tick = (y, yy) => `<line x1="${f(X(y) - 5)}" y1="${f(yy + 5)}" x2="${f(X(y) + 5)}" y2="${f(yy - 5)}" stroke="#23201C" stroke-width="1.6"/>`;
dims.push(`<line x1="${f(X(yN) - 10)}" y1="${f(dimY)}" x2="${f(X(yS) + 10)}" y2="${f(dimY)}" stroke="#23201C" stroke-width="1"/>`);
for (let i = 0; i < tk.length; i++) {
  dims.push(tick(tk[i], dimY));
  dims.push(`<line x1="${f(X(tk[i]))}" y1="${f(Z(PILE - 0.55) + 6)}" x2="${f(X(tk[i]))}" y2="${f(dimY + 8)}" stroke="#23201C" stroke-width="0.6"/>`);
  if (i + 1 < tk.length) {
    const d = tk[i + 1] - tk[i];
    const thin = d < 0.6;
    dims.push(`<text x="${f(X((tk[i] + tk[i + 1]) / 2))}" y="${f(dimY - (thin ? 22 : 8))}" font-size="${thin ? 12 : 16}" text-anchor="middle" fill="#23201C">${fmt(d, d < 1 ? 2 : 2)}</text>`);
  }
}
dims.push(`<line x1="${f(X(yN) - 10)}" y1="${f(dimY2)}" x2="${f(X(yS) + 10)}" y2="${f(dimY2)}" stroke="#23201C" stroke-width="1"/>`);
dims.push(tick(yN, dimY2), tick(yS, dimY2));
dims.push(`<text x="${f(X((yN + yS) / 2))}" y="${f(dimY2 - 8)}" font-size="18" font-weight="700" text-anchor="middle" fill="#23201C">${fmt(yN - yS)} — по линии разреза</text>`);
// высотные отметки слева
const levels = [
  [TOP + ROOF_T, "верх плиты", true], [TOP, "верх стен", true], [HEAD, "верх окон", false], [DOOR, "верх дверей", true],
  [SILL, "низ окон", false], [FF, "чистый пол", false], [0, "черновой пол", false], [GRADE, "земля", true], [FND, "низ ростверка", true], [PILE, "низ свай", true],
];
const LX = X(yN) - 14;
let prevT = -1e9;
for (const [z, nm, cond] of levels) {
  const y = Z(z);
  const ty = Math.max(y + 5, prevT + 17); prevT = ty;
  const sign = z > 0 ? "+" : z < 0 ? "" : "±";
  dims.push(`<line x1="${f(LX - 50)}" y1="${f(y)}" x2="${f(LX)}" y2="${f(y)}" stroke="#23201C" stroke-width="0.8"/>`);
  dims.push(`<path d="M ${f(LX - 50)} ${f(y)} l 6 -7 l 6 7" fill="none" stroke="#23201C" stroke-width="1"/>`);
  dims.push(`<text x="${f(LX - 58)}" y="${f(ty)}" font-size="14" text-anchor="end" fill="${cond ? "#9A4322" : "#23201C"}">${sign}${fmt(z, 3)}${cond ? " у." : ""}</text>`);
  if (Math.abs(ty - (y + 5)) > 0.5) dims.push(`<line x1="${f(LX - 52)}" y1="${f(y)}" x2="${f(LX - 56)}" y2="${f(ty - 5)}" stroke="#23201C" stroke-width="0.6"/>`);
}

// ---------- солнце ----------
const sun = [];
const yWin = cuts[0];                         // южная стена с окном O2
const yo = yWin.y0, yi = yWin.y1;             // наружная/внутренняя грань
const backWall = cuts.find((c) => c.y0 > yi + 0.5);
// лето
const sTopHit = yo + (HEAD - FF) / tS, sSillHit = yi + (SILL - FF) / tS;
const depthS = sTopHit - yi;
// зима
const zBack = HEAD - (backWall.y0 - yo) * tW;
const wSillHit = yi + (SILL - FF) / tW;
const depthW = backWall.y0 - yi;
const rayFrom = (y, z, t, zMax) => {
  const dy = Math.min((zMax - z) / t, y - yEdgeS);
  return [y - dy, z + dy * t];
};
const ray = (p0, p1, col, w, cls) =>
  `<line class="${cls}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" x1="${f(X(p0[0]))}" y1="${f(Z(p0[1]))}" x2="${f(X(p1[0]))}" y2="${f(Z(p1[1]))}" stroke="${col}" stroke-width="${w}"/>`;
const SUMC = "#E0A21A", WINC = "#D2601A";
for (const [p, hit] of [[[yo, HEAD], [sTopHit, FF]], [[yi, SILL], [sSillHit, FF]]])
  sun.push(ray(rayFrom(p[0], p[1], tS, 7.3), hit, SUMC, 2.4, "ray-s"));
for (const [p, hit] of [[[yo, HEAD], [backWall.y0, zBack]], [[yi, SILL], [wSillHit, FF]]])
  sun.push(ray(rayFrom(p[0], p[1], tW, 7.3), hit, WINC, 2.4, "ray-w"));
const patches = [
  `<rect class="patch" x="${f(X(sTopHit))}" y="${f(Z(FF) - 5)}" width="${f((sTopHit - sSillHit) * S)}" height="5" fill="${SUMC}"/>`,
  `<rect class="patch" x="${f(X(backWall.y0))}" y="${f(Z(FF) - 5)}" width="${f((backWall.y0 - wSillHit) * S)}" height="5" fill="${WINC}"/>`,
  `<rect class="patch" x="${f(X(backWall.y0))}" y="${f(Z(zBack))}" width="5" height="${f((zBack - FF) * S)}" fill="${WINC}"/>`,
];
// угол у верха окна
const arc = (t, r, col) => {
  const a = Math.atan(t);
  const cx = X(yo), cy = Z(HEAD);
  return `<path d="M ${f(cx + r)} ${f(cy)} A ${r} ${r} 0 0 0 ${f(cx + r * Math.cos(a))} ${f(cy - r * Math.sin(a))}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
};
const sunLabels = `
  ${arc(tS, 46, SUMC)}${arc(tW, 120, WINC)}
  <line x1="${f(X(yo))}" y1="${f(Z(HEAD))}" x2="${f(X(yo) + 130)}" y2="${f(Z(HEAD))}" stroke="#8C857B" stroke-width="0.8" stroke-dasharray="3 3"/>
  <text x="${f(X(yo) + 54)}" y="${f(Z(HEAD) - 40)}" font-size="17" font-weight="700" fill="#7E5600">${fmt(hSummer, 1)}°</text>
  <text x="${f(X(yo) + 64)}" y="${f(Z(HEAD) + 20)}" font-size="17" font-weight="700" fill="#A1430C">${fmt(hWinter, 1)}°</text>
  <g class="dimsun">
    <line x1="${f(X(yi))}" y1="${f(Z(FF + 0.30))}" x2="${f(X(sTopHit))}" y2="${f(Z(FF + 0.30))}" stroke="#B07C0A" stroke-width="1.4"/>
    <path d="M ${f(X(sTopHit))} ${f(Z(FF + 0.30) - 5)} v 10 M ${f(X(yi))} ${f(Z(FF + 0.30) - 5)} v 10" stroke="#B07C0A" stroke-width="1.4"/>
    <text x="${f(X(sTopHit) - 6)}" y="${f(Z(FF + 0.30) + 5)}" font-size="16" font-weight="700" text-anchor="end" fill="#7E5600">лето ${fmt(depthS)} м</text>
    <line x1="${f(X(yi))}" y1="${f(Z(FF + 0.95))}" x2="${f(X(backWall.y0))}" y2="${f(Z(FF + 0.95))}" stroke="${WINC}" stroke-width="1.4"/>
    <path d="M ${f(X(backWall.y0))} ${f(Z(FF + 0.95) - 5)} v 10 M ${f(X(yi))} ${f(Z(FF + 0.95) - 5)} v 10" stroke="${WINC}" stroke-width="1.4"/>
    <text x="${f(X((yi + backWall.y0) / 2))}" y="${f(Z(FF + 0.95) + 19)}" font-size="15" font-weight="700" text-anchor="middle" fill="#A1430C">зима ${fmt(depthW)} м · по стене до ${fmt(zBack - FF)} м</text>
  </g>`;

// ---------- проветривание ----------
const doorCut = cuts.find((c) => c.op && c.op.type === "door");
const northWin = cuts[cuts.length - 1];
const wavePts = [];
const ya0 = yS - 1.0, ya1 = yN + 1.1;
for (let y = ya0; y <= ya1 + 1e-6; y += 0.05) {
  const base = 1.45;
  const z = base + 0.13 * Math.sin(((y - ya0) / 0.9) * 2 * Math.PI);
  wavePts.push([X(y), Z(z)]);
}
const waveD = "M " + wavePts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L ");
const endP = wavePts[wavePts.length - 1];

// ---------- человек 1,75 м ----------
const PH = 1.75, py = yS - 2.0, pz = GRADE;
const px = X(py), pb = Z(pz), u = (PH * S) / 1.75;   // u — px на метр
const person = `<g id="cut-person" fill="#23201C">
  <circle cx="${f(px)}" cy="${f(pb - 1.62 * u)}" r="${f(0.11 * u)}"/>
  <path d="M ${f(px - 0.2 * u)} ${f(pb - 1.47 * u)} h ${f(0.4 * u)} l ${f(0.03 * u)} ${f(0.62 * u)} h ${f(-0.09 * u)} v ${f(0.85 * u)} h ${f(-0.1 * u)} v ${f(-0.55 * u)} h ${f(-0.08 * u)} v ${f(0.55 * u)} h ${f(-0.1 * u)} v ${f(-0.85 * u)} h ${f(-0.09 * u)} z"/>
  <line x1="${f(px - 0.42 * u)}" y1="${f(pb)}" x2="${f(px - 0.42 * u)}" y2="${f(pb - PH * u)}" stroke="#23201C" stroke-width="1"/>
  <line x1="${f(px - 0.48 * u)}" y1="${f(pb - PH * u)}" x2="${f(px - 0.36 * u)}" y2="${f(pb - PH * u)}" stroke="#23201C" stroke-width="1"/>
  <text x="${f(px - 0.5 * u)}" y="${f(pb - 0.8 * u)}" font-size="14" text-anchor="end" fill="#23201C">1,75 м</text>
</g>`;

// ---------- мини-план ----------
const MS = 24, MX0 = 74, MY0 = 400 + 13.3 * MS;
const MX = (x) => MX0 + x * MS, MY = (y) => MY0 - y * MS;
const mini = [];
for (const r of plan.rooms) mini.push(`<polygon points="${r.polygon.map((p) => `${f(MX(p[0]))},${f(MY(p[1]))}`).join(" ")}" fill="#E7E1D6"/>`);
for (const w of plan.walls) {
  const t = w.thickness / 2, hz = Math.abs(w.a[1] - w.b[1]) < 1e-9;
  const x0 = Math.min(w.a[0], w.b[0]) - (hz ? 0 : t), x1 = Math.max(w.a[0], w.b[0]) + (hz ? 0 : t);
  const y0 = Math.min(w.a[1], w.b[1]) - (hz ? t : 0), y1 = Math.max(w.a[1], w.b[1]) + (hz ? t : 0);
  mini.push(`<rect x="${f(MX(x0))}" y="${f(MY(y1))}" width="${f((x1 - x0) * MS)}" height="${f((y1 - y0) * MS)}" fill="${w.kind === "partition" ? "#8C857B" : "#23201C"}"/>`);
}
for (const o of plan.openings) {
  const hz = Math.abs(o.a[1] - o.b[1]) < 1e-9;
  const w = plan.walls.find((ww) => o.wall.split("/").includes(ww.id));
  const t = w.thickness / 2 + 0.02;
  const x0 = Math.min(o.a[0], o.b[0]) - (hz ? 0 : t), x1 = Math.max(o.a[0], o.b[0]) + (hz ? 0 : t);
  const yc = hz ? w.a[1] : null;
  const y0 = hz ? yc - t : Math.min(o.a[1], o.b[1]), y1 = hz ? yc + t : Math.max(o.a[1], o.b[1]);
  const isWin = o.type === "window" || o.type === "fixed_glazing";
  mini.push(`<rect x="${f(MX(x0))}" y="${f(MY(y1))}" width="${f((x1 - x0) * MS)}" height="${f((y1 - y0) * MS)}" fill="${isWin ? "#9CC3DA" : "#F3F0EA"}"/>`);
}
const miniLine = `M ${path.map((p) => `${f(MX(p[0]))} ${f(MY(p[1]))}`).join(" L ")}`;
const arrowAt = (p) => { // стрелка взгляда на восток
  const x = MX(p[0]), y = MY(p[1]);
  return `<path d="M ${f(x)} ${f(y)} h 22 m -7 -6 l 7 6 l -7 6" fill="none" stroke="#C0392B" stroke-width="2.4"/>
    <text x="${f(x - 8)}" y="${f(y + 5)}" font-size="16" font-weight="700" text-anchor="end" fill="#C0392B">1</text>`;
};
const p0 = path[0], pE = path[path.length - 1];

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #F3F0EA; font-family: "Inter", sans-serif; color: #23201C; }
    #cut-svg { position: absolute; inset: 0; }
    #cut-head { position: absolute; left: 64px; right: 64px; top: 84px; }
    #cut-head .k { font-size: 22px; font-weight: 700; letter-spacing: .14em; color: #8A6230; }
    #cut-head .t { font-size: 58px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-top: 12px; }
    #cut-head .d { font-size: 23px; color: #5E574E; margin-top: 12px; }
    .tag { display: inline-block; font-size: 14px; font-weight: 700; letter-spacing: .06em; color: #9A4322; border: 1.5px solid #9A4322; border-radius: 6px; padding: 1px 7px; vertical-align: 3px; }
    #cut-legend { position: absolute; left: 440px; right: 56px; top: 400px; font-size: 19px; line-height: 1.35; color: #3A3530; }
    #cut-legend .row { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
    #cut-legend .sw { flex: 0 0 46px; height: 22px; position: relative; }
    #cut-legend b { color: #23201C; }
    #cut-legend .muted { color: #5E574E; font-size: 17px; }
    #cut-foot { position: absolute; left: 64px; right: 64px; bottom: 70px; font-size: 19px; line-height: 1.45; color: #5E574E; border-top: 1.5px solid #D8D1C5; padding-top: 16px; }
    #cut-foot b { color: #9A4322; }
  </style>
  <div id="root" data-composition-id="cut" data-width="1080" data-height="1920">
    <svg id="cut-svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}">
      <defs>
        <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#E6DFD2"/><line x1="0" y1="0" x2="0" y2="10" stroke="#A89D8C" stroke-width="1.4"/>
        </pattern>
        <marker id="wavehead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#2E6FD8"/>
        </marker>
      </defs>
      <g id="cut-mini">
        ${mini.join("\n")}
        <text x="${f(MX(6.28))}" y="${f(MY(13.3) - 14)}" font-size="15" font-weight="700" text-anchor="middle" fill="#23201C">С ↑ <tspan fill="#9A4322" font-size="12">условно</tspan></text>
      </g>
      <path id="cut-line" d="${miniLine}" fill="none" stroke="#C0392B" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" stroke-linejoin="round"/>
      <g id="cut-line-ends">${arrowAt(p0)}${arrowAt(pE)}</g>

      <g id="cut-ground">${ground.join("\n")}</g>
      <g id="cut-beyond">${beyond.join("\n")}${roomLabels}</g>
      <g id="cut-black">${blk.join("\n")}${glass.join("\n")}</g>
      <g id="cut-dims">${dims.join("\n")}</g>
      <g id="cut-sun">${sun.join("\n")}</g>
      <g id="cut-patches">${patches.join("\n")}</g>
      <g id="cut-sunlab">${sunLabels}</g>
      ${person}
      <path id="cut-wave" d="${waveD}" fill="none" stroke="#2E6FD8" stroke-width="3.2" stroke-linecap="butt" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      <path id="cut-wavehead" d="M ${f(endP[0] - 4)} ${f(endP[1])} l 18 -10 l 0 20 z" fill="#2E6FD8"/>
      <g id="cut-wavelab"><text x="${f(X(10.95))}" y="${f(Z(0.98))}" font-size="15" font-weight="700" text-anchor="middle" fill="#1D52A8">сквозное проветривание</text><text x="${f(X(10.95))}" y="${f(Z(0.98) + 17)}" font-size="13" text-anchor="middle" fill="#1D52A8">двери открыты — условно</text></g>
      <g id="cut-sides">
        <text x="${f(X(yN) + 4)}" y="${f(Z(TOP + ROOF_T) - 16)}" font-size="16" font-weight="700" fill="#5E574E">← СЕВЕР</text>
        <text x="${f(X(yS) - 4)}" y="${f(Z(TOP + ROOF_T) - 16)}" font-size="16" font-weight="700" text-anchor="end" fill="#5E574E">ЮГ →</text>
      </g>
    </svg>

    <div id="cut-head">
      <div class="k">${plan.meta.kicker}</div>
      <div class="t">Разрез 1-1</div>
      <div class="d">Ступенчатый: окно на юге → окно на севере, смотрим на восток</div>
    </div>

    <div id="cut-legend">
      <div class="row"><div class="sw"><svg width="46" height="22"><line x1="2" y1="11" x2="44" y2="11" stroke="#E0A21A" stroke-width="3"/></svg></div>
        <div><b>Лето, 22 июня — ${fmt(hSummer, 1)}°</b><br>солнце заходит на <b>${fmt(depthS)} м</b></div></div>
      <div class="row"><div class="sw"><svg width="46" height="22"><line x1="2" y1="11" x2="44" y2="11" stroke="#D2601A" stroke-width="3"/></svg></div>
        <div><b>Зима, 22 декабря — ${fmt(hWinter, 1)}°</b><br>через всю спальню — <b>${fmt(depthW)} м</b></div></div>
      <div class="row"><div class="sw"><svg width="46" height="22"><path d="M2 11 q 5 -8 10 0 t 10 0 t 10 0 t 10 0" fill="none" stroke="#2E6FD8" stroke-width="3"/></svg></div>
        <div><b>Сквозное проветривание</b><br><span class="muted">окно → дверь → коридор → кухня → окно</span></div></div>
      <div class="row"><div class="sw"><svg width="46" height="22"><rect x="2" y="4" width="42" height="14" fill="#141414"/></svg></div>
        <div><b>В разрезе</b> <span class="muted">· тонко — за разрезом</span></div></div>
      <div class="muted">Казань, ${fmt(LAT, 2)}° с. ш. <span class="tag">УСЛОВНО</span><br>полдень: 90° − широта ± 23,44°</div>
    </div>

    <div id="cut-foot"><b>Условно:</b> широта Казани, сторона света, верх стен ${fmt(TOP, 3)}, двери ${fmt(DOOR)}, плоская плита вместо скатной крыши, сечения фундамента, отметка земли, без свеса крыши. Остальное — из plan.json.</div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#cut-head", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.fromTo("#cut-mini", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, 0.1);
      tl.fromTo("#cut-legend", { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, 0.25);
      tl.fromTo("#cut-line", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.55, ease: "power2.inOut" }, 0.35);
      tl.fromTo("#cut-line-ends", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.85);
      tl.fromTo("#cut-ground", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, 0.55);
      tl.fromTo("#cut-black", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 0.75);
      tl.fromTo("#cut-sides", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.95);
      tl.fromTo("#cut-beyond", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 1.1);
      tl.fromTo("#cut-dims", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, 1.25);
      tl.fromTo("#cut-sun line", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.5, ease: "power2.in", stagger: 0.06 }, 1.5);
      tl.fromTo("#cut-patches", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 2.0);
      tl.fromTo("#cut-sunlab", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.95);
      tl.fromTo("#cut-person", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 1.85);
      tl.fromTo("#cut-wave", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.55, ease: "power1.inOut" }, 2.1);
      tl.fromTo("#cut-wavehead", { opacity: 0 }, { opacity: 1, duration: 0.12 }, 2.6);
      tl.fromTo("#cut-wavelab", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 2.4);
      tl.fromTo("#cut-foot", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.35);
      window.__timelines = window.__timelines || {};
      window.__timelines["cut"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./compositions/cut.html", import.meta.url), html);
console.log({ cuts: cuts.map((c) => [c.wall.id, c.op?.id ?? "-", +c.y0.toFixed(3), +c.y1.toFixed(3)]), spaces: spaces.map((s) => [s.room?.id, +s.y0.toFixed(2), +s.y1.toFixed(2)]),
  hSummer: hSummer.toFixed(2), hWinter: hWinter.toFixed(2), depthS: depthS.toFixed(2), depthW: depthW.toFixed(2), zBack: zBack.toFixed(2), sSillHit, wSillHit, beyond: beyond.length });
