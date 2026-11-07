# plan.json — какие поля нужны генераторам

Единицы — метры. Начало координат (0,0) — наружный угол внизу слева, X вправо, Y вверх (север ≈ верх листа, если не сказано иное). Полный рабочий пример — `../kit/example/plan.json`.

| Поле | Формат | Кто использует |
|---|---|---|
| `meta.kicker`, `meta.title`, `meta.code`, `meta.address_short` | строки | шапки всех роликов, штампы |
| `meta.client_kicker`, `meta.client_disclaimer` | строки | клиентская версия: шапка и единственная оговорка |
| `assumptions[A-roof].value.ridge_x`, `ridge_z` | числа, м | двускатная крыша в аксонометрии (карниз = верх стен) |
| `outline.polygon` | `[[x,y],…]` против часовой, наружные грани, без крыльца | axo, shadows, zoning, poche |
| `walls[]` | `{id, kind: external\|internal_bearing\|partition, thickness, a:[x,y], b:[x,y]}` — осевая линия, стены только горизонтальные или вертикальные | все |
| `openings[]` | `{id, type: window\|fixed_glazing\|door\|double_door\|opening, wall, a, b, width, hinge?, opens_into: room id\|"outside"\|null, leaves?, source}` — `a`/`b` на грани стены | все; `source` со словами «размер»/«масштаб» решает, ставить ли ≈ |
| `columns[]` | `{polygon}` | axo, poche |
| `rooms[]` | `{id, n, name, polygon, area_table, area_plan_label, area_model, delta…}` | все; `area_table` — официальная площадь |
| `area_summary.total_table_stated` | число | zoning (проверка суммы), штампы |
| `assumptions[]` | `{id, topic, value, status, question}`; нужны `A-heights.value{finished_floor, wall_top, window_sill, window_head, door_head, foundation_marks[3]}`, `A-roof-render.value.thickness`, `A-floor.value[]` (строка с «плиты … NNN мм») | axo, section, лист А3 («условно» берётся из status) |
| `site` | `{city, latitude, longitude, note}` | section, shadows |
| `sections[0]` | `{path:[[x,y],…] (ступеньки), view:"east"}` — начинается снаружи у южного окна, заканчивается снаружи у северного | section |
| `zones[]` | `{id, name, room, point:[x,y], note}` — точки внутри больших комнат (кухня, гостиная) и вход | routes |
| `routes[]` | `{id, name, stops, waypoints:[{room}\|{door}\|{zone}\|{pt}]}` — у двери генератор сам добавит подход ±0,55 м | routes (стили по id: morning, morning2, morning3, guest, groceries — новые id добавь в `style`) |
| `zoning.zones[]` | `{id: day\|night\|service, name, rooms:[…]}` — каждая комната ровно в одной зоне | zoning |
| `shadow_study` | `{date:"YYYY-MM-DD", tz_hours, tz_name, wall_height, hours:[8,18], freeze:[8,12,18], note}` | shadows |
| `render_hints` (необязательно) | `label_points.{axo,routes,zoning,shadows}.{roomId:[x,y]}`, `door_badge_offsets.{doorId:[dx,dy]}` | подписи в неудобных комнатах |
