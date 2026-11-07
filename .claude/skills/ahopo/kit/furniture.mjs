// Мебель условными знаками из plan.json → SVG. Работает в любой аффинной проекции:
// M([x, y]) → [sx, sy] (план сверху или пол аксонометрии).
// furnitureSVG(plan, M, { stroke, width, fill, byRoom }) → строка SVG или { roomId: строка } при byRoom.

const f = (n) => n.toFixed(1);

export function furnitureSVG(plan, M, opt = {}) {
  const items = plan.furniture?.items || [];
  const stroke = opt.stroke || "#6F685F", sw = opt.width || 1.1, fill = opt.fill || "none";
  const out = {};
  const poly = (pts, extra = "") => `<polygon points="${pts.map((p) => M(p)).map((q) => `${f(q[0])},${f(q[1])}`).join(" ")}" ${extra}/>`;
  const line = (a, b) => { const p = M(a), q = M(b); return `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`; };
  const ell = (cx, cy, rx, ry, n = 28) => poly(Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)]));
  const rect = (x0, y0, x1, y1, extra) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], extra);
  for (const it of items) {
    const [x0, y0, x1, y1] = it.box, w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // локальная система: u — вдоль стены «изголовья», v — от изголовья (0) к ногам (1)
    const hd = it.head || "N";
    const at = (u, v) => hd === "W" ? [x0 + v * w, y1 - u * h] : hd === "E" ? [x1 - v * w, y0 + u * h] : hd === "S" ? [x0 + u * w, y0 + v * h] : [x1 - u * w, y1 - v * h];
    const depth = hd === "W" || hd === "E" ? w : h, span = hd === "W" || hd === "E" ? h : w;
    const band = (v0, v1) => poly([at(0, v0), at(1, v0), at(1, v1), at(0, v1)]);
    const g = [];
    switch (it.type) {
      case "bed": {
        g.push(rect(x0, y0, x1, y1, `fill="${opt.bedFill || fill}"`));
        const pv = 0.06 / depth, pd = 0.42 / depth;               // подушки
        const two = span > 1.3;
        if (two) { g.push(poly([at(0.06, pv), at(0.47, pv), at(0.47, pd), at(0.06, pd)])); g.push(poly([at(0.53, pv), at(0.94, pv), at(0.94, pd), at(0.53, pd)])); }
        else g.push(poly([at(0.12, pv), at(0.88, pv), at(0.88, pd), at(0.12, pd)]));
        g.push(line(at(0, 0.36 + 0.42 / depth), at(1, 0.36 + 0.42 / depth)));   // край одеяла
        break;
      }
      case "sofa": {
        g.push(rect(x0, y0, x1, y1, `fill="${fill}"`));
        g.push(band(0, 0.24 / depth));   // спинка
        const n = Math.max(1, Math.round(span / 0.95));
        for (let i = 1; i < n; i++) g.push(line(at(i / n, 0.24 / depth), at(i / n, 1)));
        break;
      }
      case "coffee_table": g.push(ell(cx, cy, w / 2, h / 2)); break;
      case "table": case "nightstand": case "fridge": g.push(rect(x0, y0, x1, y1, `fill="${fill}"`)); if (it.type === "fridge") g.push(line(at(0, 0.12), at(1, 0.12))); break;
      case "chair": g.push(rect(x0, y0, x1, y1, `fill="${fill}"`)); g.push(band(0, 0.25)); break;
      case "counter": g.push(rect(x0, y0, x1, y1, `fill="${fill}"`)); g.push(line(at(0, 0.9), at(1, 0.9))); break;
      case "sink": g.push(ell(cx, cy, w / 2, h / 2)); g.push(ell(cx, cy, 0.03, 0.03, 10)); break;
      case "stove": g.push(rect(x0, y0, x1, y1)); for (const [a, b] of [[0.27, 0.3], [0.73, 0.3], [0.27, 0.7], [0.73, 0.7]]) { const p = at(a, b); g.push(ell(p[0], p[1], Math.min(w, h) * 0.15, Math.min(w, h) * 0.15, 16)); } break;
      case "toilet": case "bidet": {
        if (it.type === "toilet") g.push(band(0, 0.3));
        const c = at(0.5, it.type === "toilet" ? 0.64 : 0.5), rx = (hd === "W" || hd === "E" ? depth * (it.type === "toilet" ? 0.34 : 0.45) : span * 0.42), ry = (hd === "W" || hd === "E" ? span * 0.42 : depth * (it.type === "toilet" ? 0.34 : 0.45));
        g.push(ell(c[0], c[1], rx, ry));
        break;
      }
      case "washbasin": g.push(rect(x0, y0, x1, y1)); { const c = at(0.5, 0.55); g.push(ell(c[0], c[1], (hd === "W" || hd === "E" ? depth : span) * 0.32, (hd === "W" || hd === "E" ? span : depth) * 0.32)); } break;
      case "bath": {
        g.push(rect(x0, y0, x1, y1, `fill="${fill}"`));
        const ins = 0.07;
        g.push(rect(x0 + ins, y0 + ins, x1 - ins, y1 - ins));
        const d = at(0.5, 0.12); g.push(ell(d[0], d[1], 0.04, 0.04, 10));
        break;
      }
      case "shower": g.push(rect(x0, y0, x1, y1)); g.push(line([x0, y0], [x1, y1])); g.push(line([x0, y1], [x1, y0])); g.push(ell(cx, cy, 0.06, 0.06, 12)); break;
      case "shelves": { g.push(rect(x0, y0, x1, y1)); const n = Math.max(2, Math.round(span / 0.35)); for (let i = 1; i < n; i++) g.push(line(at(i / n, 0), at((i - 0.6) / n, 1))); break; }
      case "tv_unit": case "storage": g.push(rect(x0, y0, x1, y1)); g.push(line(at(0, 0.5), at(1, 0.5))); break;
      case "boiler": g.push(rect(x0, y0, x1, y1)); g.push(ell(cx, cy, Math.min(w, h) * 0.32, Math.min(w, h) * 0.32, 20)); break;
      default: g.push(rect(x0, y0, x1, y1));
    }
    (out[it.room] ||= []).push(g.join(""));
  }
  const wrap = (s) => `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">${s}</g>`;
  if (opt.byRoom) return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, wrap(v.join(""))]));
  return wrap(Object.values(out).flat().join(""));
}
