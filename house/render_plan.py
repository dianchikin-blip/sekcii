"""Рисует план этажа в SVG строго из plan.json (никаких других источников).

Запуск:  python3 house/render_plan.py house/plan.json house/plan_check.svg
"""
import json, math, sys

S = 60          # пикселей на метр
PAD = 1.6       # поля, м


def main(src, dst):
    p = json.load(open(src, encoding="utf-8"))
    xs = [pt[0] for r in p["rooms"] for pt in r["polygon"]] + [pt[0] for pt in p["outline"]["polygon"]]
    ys = [pt[1] for r in p["rooms"] for pt in r["polygon"]] + [pt[1] for pt in p["outline"]["polygon"]]
    minx, maxx, miny, maxy = min(xs) - PAD, max(xs) + PAD, min(ys) - PAD, max(ys) + PAD
    W, H = (maxx - minx) * S, (maxy - miny) * S

    def X(x): return (x - minx) * S
    def Y(y): return (maxy - y) * S          # ось Y вверх, как на листе
    def pts(poly): return " ".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in poly)

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}" '
           f'font-family="Helvetica, Arial, sans-serif">',
           f'<rect width="100%" height="100%" fill="#fff"/>']

    # комнаты
    for r in p["rooms"]:
        fill = "#f3f1ec" if r["id"] != "R8" else "#eceff3"
        out.append(f'<polygon points="{pts(r["polygon"])}" fill="{fill}" stroke="none"/>')
    for b in p.get("built_ins", []):
        out.append(f'<polygon points="{pts(b["polygon"])}" fill="none" stroke="#b9b4aa" stroke-width="1" stroke-dasharray="4 3"/>')

    # стены — прямоугольники вокруг осевой линии
    colors = {"external": "#2b2b2b", "internal_bearing": "#6b6258", "partition": "#a39a8e"}
    for w in p["walls"]:
        (ax, ay), (bx, by), t = w["a"], w["b"], w["thickness"]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * t / 2, dx / L * t / 2
        poly = [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]
        out.append(f'<polygon points="{pts(poly)}" fill="{colors[w["kind"]]}"/>')

    # проёмы: вырезаем белым поверх стены по толщине стены
    wall_by_id = {w["id"]: w for w in p["walls"]}
    for o in p["openings"]:
        wid = o["wall"].split("/")[0]
        w = wall_by_id[wid]
        t = w["thickness"] + 0.02
        (ax, ay), (bx, by) = o["a"], o["b"]
        horiz = abs(w["a"][1] - w["b"][1]) < 1e-6
        if horiz:
            c = w["a"][1]
            poly = [(ax, c - t / 2), (bx, c - t / 2), (bx, c + t / 2), (ax, c + t / 2)]
        else:
            c = w["a"][0]
            poly = [(c - t / 2, ay), (c + t / 2, ay), (c + t / 2, by), (c - t / 2, by)]
        out.append(f'<polygon points="{pts(poly)}" fill="#fff"/>')
        if o["type"] in ("window", "fixed_glazing"):
            if horiz:
                for k in (-0.06, 0, 0.06):
                    out.append(f'<line x1="{X(ax):.1f}" y1="{Y(c + k):.1f}" x2="{X(bx):.1f}" y2="{Y(c + k):.1f}" stroke="#3a7bd5" stroke-width="1.5"/>')
            else:
                for k in (-0.06, 0, 0.06):
                    out.append(f'<line x1="{X(c + k):.1f}" y1="{Y(ay):.1f}" x2="{X(c + k):.1f}" y2="{Y(by):.1f}" stroke="#3a7bd5" stroke-width="1.5"/>')

        # дуги открывания
        leaves = o.get("leaves") or ([dict(hinge=o["hinge"], width=o["width"])] if o.get("hinge") else [])
        for lf in leaves:
            hx, hy = lf["hinge"]; rad = lf["width"]
            # направление «в комнату» — к центру комнаты opens_into (или наружу от контура)
            target = o.get("opens_into")
            if target == "outside":
                sgn = 1 if horiz else 1
                side = (0, 1) if horiz else (1, 0)
            else:
                room = next(r for r in p["rooms"] if r["id"] == target)
                cx = sum(q[0] for q in room["polygon"]) / len(room["polygon"])
                cy = sum(q[1] for q in room["polygon"]) / len(room["polygon"])
                side = (0, 1 if cy > c else -1) if horiz else (1 if cx > c else -1, 0)
            # закрытое положение — вдоль стены к другому краю проёма
            mid = ((ax + bx) / 2, (ay + by) / 2)
            along = (1 if mid[0] > hx else -1, 0) if horiz else (0, 1 if mid[1] > hy else -1)
            open_end = (hx + side[0] * rad, hy + side[1] * rad)
            closed_end = (hx + along[0] * rad, hy + along[1] * rad)
            out.append(f'<line x1="{X(hx):.1f}" y1="{Y(hy):.1f}" x2="{X(open_end[0]):.1f}" y2="{Y(open_end[1]):.1f}" stroke="#c0392b" stroke-width="1.5"/>')
            sweep = 1 if (along[0] * side[1] - along[1] * side[0]) < 0 else 0
            out.append(f'<path d="M {X(closed_end[0]):.1f} {Y(closed_end[1]):.1f} A {rad*S:.1f} {rad*S:.1f} 0 0 {sweep} '
                       f'{X(open_end[0]):.1f} {Y(open_end[1]):.1f}" fill="none" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 2"/>')

    for cmn in p.get("columns", []):
        out.append(f'<polygon points="{pts(cmn["polygon"])}" fill="#6b6258"/>')

    # подписи комнат
    for r in p["rooms"]:
        cx = sum(q[0] for q in r["polygon"]) / len(r["polygon"])
        cy = sum(q[1] for q in r["polygon"]) / len(r["polygon"])
        d = r["delta_model_vs_table"]
        col = "#1b6b4f" if abs(r["delta_pct"]) < 2 else ("#b8860b" if abs(r["delta_pct"]) < 5 else "#c0392b")
        out.append(f'<text x="{X(cx):.1f}" y="{Y(cy) - 8:.1f}" font-size="13" text-anchor="middle" fill="#222">{r["n"]}. {r["name"].split(" (")[0]}</text>')
        out.append(f'<text x="{X(cx):.1f}" y="{Y(cy) + 9:.1f}" font-size="11" text-anchor="middle" fill="#555">'
                   f'модель {r["area_model"]:.2f} / план {r["area_table"]:.2f}</text>')
        out.append(f'<text x="{X(cx):.1f}" y="{Y(cy) + 24:.1f}" font-size="11" text-anchor="middle" fill="{col}">Δ {d:+.2f} м²</text>')

    # габариты
    ov = p["outline"]["overall"]
    out.append(f'<text x="{X(ov["x"]/2):.1f}" y="{Y(-0.9):.1f}" font-size="13" text-anchor="middle">{ov["x"]:.2f} м</text>')
    out.append(f'<text x="{X(-0.9):.1f}" y="{Y(ov["y"]/2):.1f}" font-size="13" text-anchor="middle" '
               f'transform="rotate(-90 {X(-0.9):.1f} {Y(ov["y"]/2):.1f})">{ov["y"]:.2f} м</text>')
    north = p["north"]
    lbl = "Север: не указан" if not north["known"] else f'Север: {north["angle_deg"]}°'
    out.append(f'<text x="{X(maxx - 0.2):.1f}" y="{Y(maxy - 0.6):.1f}" font-size="13" text-anchor="end" fill="#c0392b">{lbl}</text>')
    out.append("</svg>")
    open(dst, "w", encoding="utf-8").write("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
