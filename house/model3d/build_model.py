"""3D-модель дома из plan.json (Blender/bpy) → рендер PNG и модель GLB.

Запуск:
  python3 build_model.py ../plan.json photo out.png [--w 1600 --h 1200 --samples 96 --hour 15 --cam sw]
  python3 build_model.py ../plan.json clay  out.png
Режимы: photo — материалы из plan.finishes и небо; clay — белый макет.
"""
import json, math, sys, argparse
import bpy, bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("plan"); ap.add_argument("mode", choices=["photo", "clay"]); ap.add_argument("out")
ap.add_argument("--w", type=int, default=1600); ap.add_argument("--h", type=int, default=1200)
ap.add_argument("--samples", type=int, default=96); ap.add_argument("--hour", type=float, default=15.0)
ap.add_argument("--cam", default="sw"); ap.add_argument("--glb", default=None)
args = ap.parse_args(sys.argv[1:])

plan = json.load(open(args.plan, encoding="utf-8"))
A = {a["id"]: a for a in plan["assumptions"]}
H = A["A-heights"]["value"]; RF = A["A-roof"]["value"]; FIN = plan["finishes"]
WT, SILL, HEAD, DOOR = H["wall_top"], H["window_sill"], H["window_head"], H["door_head"]
GRADE = H["foundation_marks"][0]
OUT = plan["outline"]["polygon"]
XS = [p[0] for p in OUT]; X0, X1 = min(XS), max(XS)
XR, RZ = RF["ridge_x"], RF["ridge_z"]
OVE, OVG = FIN["roof_overhang"]["eaves"], FIN["roof_overhang"]["gables"]
ROOF_T = 0.22

def h_roof(x):  # низ кровли над точкой x (карниз = верх стены по наружной грани)
    return WT + (RZ - WT) * ((x - X0) / (XR - X0) if x <= XR else (X1 - x) / (X1 - XR))

# ---------- сцена ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

def hexrgb(h, a=1.0):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x ** 2.2 for x in c] + [a]

MATS = {}
def mat(name, color, rough=0.8, metal=0.0, transmission=0.0, bump=None):
    if args.mode == "clay" and name not in ("glass",):
        color, rough, metal, bump = ("#ECEAE6" if name != "ground" else "#F4F3F0"), 0.9, 0.0, None
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hexrgb(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = 1.45
    if bump:
        kind, scale, strength = bump
        tex = nt.nodes.new("ShaderNodeTexWave" if kind == "seam" else "ShaderNodeTexNoise")
        coord = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(coord.outputs["Object"], tex.inputs["Vector"])
        tex.inputs["Scale"].default_value = scale
        if kind == "seam":
            tex.wave_type = "BANDS"; tex.bands_direction = "Y"; tex.wave_profile = "SAW"
        bn = nt.nodes.new("ShaderNodeBump"); bn.inputs["Strength"].default_value = strength
        nt.links.new(tex.outputs["Fac"], bn.inputs["Height"])
        nt.links.new(bn.outputs["Normal"], bsdf.inputs["Normal"])
        if kind == "grass":
            ramp = nt.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].color = hexrgb("#4C6B2E"); ramp.color_ramp.elements[1].color = hexrgb("#7A9A48")
            nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    MATS[name] = m
    return m

M_PL = lambda: mat("plaster", FIN["facade"]["color"], 0.85, bump=("noise", 60, 0.04))
M_PLINTH = lambda: mat("plinth", FIN["plinth"]["color"], 0.8, bump=("noise", 40, 0.05))
M_ROOF = lambda: mat("roof", FIN["roof"]["color"], 0.6, 0.1, bump=("seam", 2.9, 0.25))
M_FRAME = lambda: mat("frame", FIN["window_frames"]["color"], 0.4)
M_GLASS = lambda: mat("glass", "#9DB3C2", 0.02, 0.0, transmission=1.0)
M_DOOR = lambda: mat("door", "#4A4D50", 0.5)
M_CONC = lambda: mat("concrete", "#BDB8B0", 0.85, bump=("noise", 25, 0.06))
M_GROUND = lambda: mat("ground", "#5F7F3A", 0.95, bump=("grass", 6, 0.08))
M_DARK = lambda: mat("interior", "#2A2A2A", 0.9)

def add_mesh(name, verts, faces, m):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob); ob.data.materials.append(m)
    return ob

def box(name, x0, y0, z0, x1, y1, z1, m):
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4: return
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return add_mesh(name, v, f, m)

def prism(name, poly, z0, z1, m):
    n = len(poly)
    v = [(x, y, z0) for x, y in poly] + [(x, y, z1) for x, y in poly]
    f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return add_mesh(name, v, f, m)

# ---------- стены с проёмами ----------
op_by_wall = {}
for o in plan["openings"]:
    for wid in o["wall"].split("/"): op_by_wall.setdefault(wid, []).append(o)
ext_ids = {w["id"] for w in plan["walls"] if w["kind"] == "external"}

def frame_window(horiz, c, t, s0, s1, z0, z1, glazed=True, door=False):
    """рама 6 см по контуру проёма, импост при ширине > 1,3 м, стекло по оси стены"""
    fw, fd = 0.06, 0.08
    def b(a0, a1, zz0, zz1, m, d=fd):
        if horiz: box("fr", a0, c - d / 2, zz0, a1, c + d / 2, zz1, m)
        else: box("fr", c - d / 2, a0, zz0, c + d / 2, a1, zz1, m)
    F = M_FRAME()
    b(s0, s1, z1 - fw, z1, F); b(s0, s0 + fw, z0, z1, F); b(s1 - fw, s1, z0, z1, F)
    if not door: b(s0, s1, z0, z0 + fw, F)
    if s1 - s0 > 1.3: m = (s0 + s1) / 2; b(m - fw / 2, m + fw / 2, z0, z1, F)
    if glazed: b(s0 + fw, s1 - fw, z0 + (0 if door else fw), z1 - fw, M_GLASS(), d=0.012)
    else: b(s0 + fw, s1 - fw, z0, z1 - fw, M_DOOR(), d=0.05)
    # отлив под окном: наружу от плоскости стены
    if not door:
        ext = 0.06
        if horiz:
            yo = c - t if c < 6 else c + t           # наружная грань: юг у нижних стен, север у верхних
            y0, y1 = (yo - ext, yo + 0.02) if c < 6 else (yo - 0.02, yo + ext)
            box("sill", s0 - 0.03, y0, z0 - 0.04, s1 + 0.03, y1, z0, M_FRAME())
        else:
            xo = c - t if c < 6 else c + t
            x0_, x1_ = (xo - ext, xo + 0.02) if c < 6 else (xo - 0.02, xo + ext)
            box("sill", x0_, s0 - 0.03, z0 - 0.04, x1_, s1 + 0.03, z0, M_FRAME())

for w in plan["walls"]:
    horiz = abs(w["a"][1] - w["b"][1]) < 1e-9
    t = w["thickness"] / 2
    lo = min(w["a"][0], w["b"][0]) if horiz else min(w["a"][1], w["b"][1])
    hi = max(w["a"][0], w["b"][0]) if horiz else max(w["a"][1], w["b"][1])
    c = w["a"][1] if horiz else w["a"][0]
    lo, hi = lo + 0.003, hi - 0.003      # торцы чуть внутрь соседних стен — без совпадающих плоскостей
    def piece(s0, s1, z0, z1):
        if horiz: box(w["id"], s0, c - t, z0, s1, c + t, z1, M_PL())
        else: box(w["id"], c - t, s0, z0, c + t, s1, z1, M_PL())
    ops = []
    for o in op_by_wall.get(w["id"], []):
        a0 = min(o["a"][0], o["b"][0]) if horiz else min(o["a"][1], o["b"][1])
        a1 = max(o["a"][0], o["b"][0]) if horiz else max(o["a"][1], o["b"][1])
        a0, a1 = max(a0, lo), min(a1, hi)
        if a1 <= a0: continue
        win = o["type"] in ("window", "fixed_glazing")
        glazed_door = o["type"] == "double_door"
        z0 = SILL if win else 0.0
        z1 = HEAD if (win or glazed_door) else DOOR
        ops.append((a0, a1, z0, z1, win, glazed_door, o))
    ops.sort(key=lambda q: q[0])
    cur = lo
    for a0, a1, z0, z1, win, gd, o in ops:
        piece(cur, a0, 0, WT)
        if z0 > 0: piece(a0, a1, 0, z0)
        piece(a0, a1, z1, WT)
        if w["id"] in ext_ids:
            if win or gd: frame_window(horiz, c, t, a0, a1, z0, z1, glazed=True, door=gd)
            elif o["type"] == "door": frame_window(horiz, c, t, a0, a1, z0, z1, glazed=False, door=True)
        cur = a1
    piece(cur, hi, 0, WT)

for cl in plan["columns"]:
    xs = [p[0] for p in cl["polygon"]]; ys = [p[1] for p in cl["polygon"]]
    box("column", min(xs), min(ys), -0.03, max(xs), max(ys), h_roof((min(xs) + max(xs)) / 2), M_PL())

# фронтоны: над наружными стенами вдоль X — от верха стены до низа кровли
for w in plan["walls"]:
    if w["kind"] != "external" or abs(w["a"][1] - w["b"][1]) > 1e-9: continue
    xa, xb = sorted([w["a"][0], w["b"][0]]); yc = w["a"][1]; t = w["thickness"] / 2
    xs = [xa] + ([XR] if xa < XR < xb else []) + [xb]
    prof = [(x, WT) for x in xs] + [(x, h_roof(x)) for x in reversed(xs)]
    n = len(prof)
    v = [(x, yc - t, z) for x, z in prof] + [(x, yc + t, z) for x, z in prof]
    f = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    add_mesh("gable_" + w["id"], v, f, M_PL())
# наружные стены вдоль Y под скатом: заделка от верха стены до низа кровли (иначе виден чердак)
for w in plan["walls"]:
    if w["kind"] != "external" or abs(w["a"][0] - w["b"][0]) > 1e-9: continue
    xc, t = w["a"][0], w["thickness"] / 2
    ya, yb = sorted([w["a"][1], w["b"][1]])
    top = min(h_roof(xc - t), h_roof(xc + t))
    if top > WT + 0.01: box("infill_" + w["id"], xc - t, ya, WT, xc + t, yb, top, M_PL())
# торец выступа у конька (кухня выше спального крыла)
yW = max(p[1] for p in OUT if p[0] <= XR + 1e-6); yE = max(p[1] for p in OUT if p[0] >= XR - 1e-6)
if yE > yW + 1e-6:
    ww = next(w for w in plan["walls"] if w["id"] == "W-N2W")
    box("gable_step", ww["a"][0] - ww["thickness"] / 2, yW, WT, ww["a"][0] + ww["thickness"] / 2, yE, RZ, M_PL())

# ---------- перекрытие, пол, цоколь, крыльцо ----------
for r in plan["rooms"]:            # перекрытие и пол — только внутри помещений, чтобы не вылезали на фасад
    if r["id"] == "R8": continue
    prism("ceil_" + r["id"], r["polygon"], WT - 0.25, WT - 0.05, M_DARK())
    prism("floor_" + r["id"], r["polygon"], 0.0, 0.12, M_DARK())
prism("plinth", [(x, y) for x, y in OUT], GRADE, 0.0, M_PLINTH())
porch = next((r for r in plan["rooms"] if r["id"] == "R8"), None)
if porch:
    prism("porch", porch["polygon"], GRADE, -0.03, M_CONC())
    xs = [p[0] for p in porch["polygon"]]
    box("step", min(xs) + 0.15, -0.35, GRADE, max(xs) - 0.45, 0.0, -0.20, M_CONC())
    d1 = next(o for o in plan["openings"] if o["id"] == "D1")
    box("path", d1["a"][0] - 0.05, -9.0, GRADE - 0.01, d1["b"][0] + 0.05, -0.35, GRADE + 0.015, M_CONC())
box("ground", -400, -400, GRADE - 0.3, 400, 400, GRADE, M_GROUND())

# ---------- кровля: два ската со свесами, толщина ROOF_T ----------
def roof_plane(name, xa, xb, ya, yb):
    pts = [(xa, ya), (xb, ya), (xb, yb), (xa, yb)]
    def hh(x):  # продолжение ската за стену на свес
        if x < X0: return WT - (RZ - WT) / (XR - X0) * (X0 - x)
        if x > X1: return WT - (RZ - WT) / (X1 - XR) * (x - X1)
        return h_roof(x)
    v = [(x, y, hh(x)) for x, y in pts] + [(x, y, hh(x) + ROOF_T) for x, y in pts]
    f = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return add_mesh(name, v, f, M_ROOF())
ys_all = [p[1] for p in OUT]
roof_plane("roof_W", X0 - OVE, XR, min(ys_all) - OVG, yW + OVG)
roof_plane("roof_E", XR, X1 + OVE, min(ys_all) - OVG, yE + OVG)
box("ridge", XR - 0.12, min(ys_all) - OVG, RZ + ROOF_T - 0.04, XR + 0.12, yE + OVG, RZ + ROOF_T + 0.08, M_ROOF())

# ---------- солнце (NOAA, как в этюде теней) ----------
def sun_pos(lat, lon, tz, Y, M, D, hour):
    rad = math.pi / 180
    a = (14 - M) // 12; y = Y + 4800 - a; m = M + 12 * a - 3
    JDN = D + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    JD = JDN - 0.5 + (hour - tz) / 24; T = (JD - 2451545) / 36525
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    Mg = 357.52911 + T * (35999.05029 - 0.0001537 * T); e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    C = math.sin(Mg * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * Mg * rad) * (0.019993 - 0.000101 * T) + math.sin(3 * Mg * rad) * 0.000289
    lam = L0 + C - 0.00569 - 0.00478 * math.sin((125.04 - 1934.136 * T) * rad)
    eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * math.cos((125.04 - 1934.136 * T) * rad)
    decl = math.asin(math.sin(eps * rad) * math.sin(lam * rad)) / rad
    yv = math.tan(eps / 2 * rad) ** 2
    eqt = 4 / rad * (yv * math.sin(2 * L0 * rad) - 2 * e * math.sin(Mg * rad) + 4 * e * yv * math.sin(Mg * rad) * math.cos(2 * L0 * rad) - 0.5 * yv * yv * math.sin(4 * L0 * rad) - 1.25 * e * e * math.sin(2 * Mg * rad))
    tst = (hour * 60 + eqt + 4 * lon - 60 * tz) % 1440
    ha = tst / 4 - 180
    cz = math.sin(lat * rad) * math.sin(decl * rad) + math.cos(lat * rad) * math.cos(decl * rad) * math.cos(ha * rad)
    zen = math.acos(max(-1, min(1, cz))) / rad
    az = math.acos(max(-1, min(1, (math.sin(lat * rad) * math.cos(zen * rad) - math.sin(decl * rad)) / (math.cos(lat * rad) * math.sin(zen * rad))))) / rad
    az = (az + 180) % 360 if ha > 0 else (540 - az) % 360
    return 90 - zen, az
SS = plan["shadow_study"]; Y_, M_, D_ = map(int, SS["date"].split("-"))
alt, az = sun_pos(plan["site"]["latitude"], plan["site"]["longitude"], SS["tz_hours"], Y_, M_, D_, args.hour)
north = plan["north"].get("angle_deg") or 0.0
azp = az - north   # азимут в системе плана (верх листа = север, условно)
to_sun = Vector((math.sin(math.radians(azp)) * math.cos(math.radians(alt)), math.cos(math.radians(azp)) * math.cos(math.radians(alt)), math.sin(math.radians(alt))))
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 4.2 if args.mode == "photo" else 3.4; sun.angle = math.radians(0.6)
sob = bpy.data.objects.new("sun", sun); col.objects.link(sob)
sob.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()

# небо
world = bpy.data.worlds.new("world"); scene.world = world; world.use_nodes = True
wn = world.node_tree; bg = wn.nodes["Background"]
if args.mode == "photo":
    sky = wn.nodes.new("ShaderNodeTexSky")
    types = [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items]
    for t in ("MULTIPLE_SCATTERING", "NISHITA", "SINGLE_SCATTERING", "HOSEK_WILKIE", "PREETHAM"):
        if t in types: sky.sky_type = t; break
    for prop, val in (("sun_disc", False), ("sun_elevation", math.radians(alt)), ("sun_rotation", math.radians(90 - azp)), ("altitude", 300.0)):
        if hasattr(sky, prop):
            try: setattr(sky, prop, val)
            except Exception: pass
    wn.links.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.22
else:
    bg.inputs["Color"].default_value = (0.95, 0.95, 0.96, 1); bg.inputs["Strength"].default_value = 0.9

# ---------- камера ----------
cx, cy = (X0 + X1) / 2, (min(ys_all) + max(ys_all)) / 2
cams = {"sw": (222, 19.5, 4.2, 30), "se": (140, 19.5, 4.2, 30), "aerial": (215, 28.0, 17.0, 35)}
caz, dist, ch, lens = cams[args.cam]
cam = bpy.data.cameras.new("cam"); cam.lens = lens
cob = bpy.data.objects.new("cam", cam); col.objects.link(cob); scene.camera = cob
cob.location = (cx + dist * math.sin(math.radians(caz)), cy + dist * math.cos(math.radians(caz)), ch)
target = Vector((cx, cy - 0.5, 1.6))
cob.rotation_euler = (target - cob.location).to_track_quat("-Z", "Y").to_euler()

# ---------- рендер ----------
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"; scene.cycles.samples = args.samples; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = args.w, args.h; scene.render.resolution_percentage = 100
try: scene.view_settings.view_transform = "AgX"
except Exception: scene.view_settings.view_transform = "Filmic"
for look in ("AgX - Medium High Contrast", "Medium High Contrast", "None"):
    try: scene.view_settings.look = look; break
    except Exception: pass
scene.render.filepath = args.out
bpy.ops.render.render(write_still=True)
if args.glb:
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format="GLB")
print(f"done {args.out}: sun alt {alt:.1f} az {az:.0f}")
