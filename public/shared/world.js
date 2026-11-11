/*
 * MEOW — общее описание мира (используется и сервером, и браузером).
 * Здесь: размеры, координаты спрайтов в листах CraftPix, расстановка мебели и коллизии.
 *
 * Все координаты — в "логических" пикселях (1 пиксель арта = 1 единица).
 * Браузер рисует мир с масштабом x2.
 *
 * Спрайты: [x, y, w, h] — прямоугольник в листе. b — зона столкновений
 * [bx, by, bw, bh] внутри спрайта (по умолчанию объект проходимый).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MeowWorld = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const WORLD = { width: 400, height: 240, wallH: 48, scale: 2 };

  // Куда может встать кот (его "ноги" = точка x,y).
  const BOUNDS = { minX: 12, maxX: 388, minY: 60, maxY: 236 };
  const FOOT = { halfW: 6, h: 4 };

  // Листы изображений
  const SHEETS = {
    interior: "assets/tavern/interior.png",
    walls: "assets/tavern/walls.png"
  };

  // Спрайты из Interior_objects.png
  const SPRITES = {
    shelfFull1:  { sheet: "interior", r: [268, 100, 46, 58], b: [0, 38, 46, 20], use: "shelf" },
    shelfFull2:  { sheet: "interior", r: [332, 100, 46, 58], b: [0, 38, 46, 20], use: "shelf" },
    shelfVase1:  { sheet: "interior", r: [75, 100, 47, 58],  b: [0, 38, 47, 20], use: "shelf" },
    shelfVase2:  { sheet: "interior", r: [135, 100, 47, 58], b: [0, 38, 47, 20], use: "shelf" },
    boardB:      { sheet: "interior", r: [99, 169, 41, 49],  b: [0, 33, 41, 16], use: "board" },
    boardC:      { sheet: "interior", r: [145, 172, 41, 49], b: [0, 33, 41, 16], use: "board" },
    armorRack:   { sheet: "interior", r: [313, 170, 47, 51], b: [0, 36, 47, 15], use: "rack" },
    weaponRack:  { sheet: "interior", r: [0, 309, 48, 43],  b: [2, 28, 44, 15], use: "rack" },
    tablePlain1: { sheet: "interior", r: [92, 235, 47, 23],  b: [0, 8, 47, 15] },
    tablePlain3: { sheet: "interior", r: [92, 272, 47, 23],  b: [0, 8, 47, 15] },
    deskBook:    { sheet: "interior", r: [220, 227, 56, 33], b: [0, 14, 56, 19] },
    deskBook2:   { sheet: "interior", r: [300, 226, 56, 34], b: [0, 14, 56, 20] },
    longTable:   { sheet: "interior", r: [277, 274, 56, 28], b: [0, 0, 56, 28], use: "bar" },
    rug:         { sheet: "interior", r: [7, 228, 65, 69] },
    banner:      { sheet: "interior", r: [178, 309, 45, 42] },
    plantA:      { sheet: "interior", r: [228, 309, 18, 33], b: [3, 22, 12, 11], use: "plant" },
    plantB:      { sheet: "interior", r: [267, 309, 17, 34], b: [3, 23, 11, 11], use: "plant" },
    plantC:      { sheet: "interior", r: [296, 309, 18, 33], b: [3, 22, 12, 11], use: "plant" },
    chestA:      { sheet: "interior", r: [245, 357, 23, 20], b: [0, 6, 23, 14], use: "chest" },
    chestB:      { sheet: "interior", r: [276, 359, 23, 20], b: [0, 6, 23, 14], use: "chest" },
    sofa:        { sheet: "interior", r: [122, 311, 52, 41], b: [0, 16, 52, 25], use: "sofa" },
    chair:       { sheet: "interior", r: [161, 357, 12, 21], b: [1, 12, 10, 9] },
    // Из Walls_interior.png
    floorTile:   { sheet: "walls", r: [288, 80, 48, 48] },
    wallPlain:   { sheet: "walls", r: [16, 80, 64, 48] },
    wallWindows: { sheet: "walls", r: [80, 80, 48, 48] }
  };

  // Статичный слой (рисуется один раз): пол, стена, коврик, баннер, окна.
  // Порядок важен. at = левый верхний угол, в мире.
  const STATIC_LAYER = [
    { s: "rug", x: 168, y: 120 },
    { s: "banner", x: 106, y: 3 },
    { s: "wallWindows", x: 258, y: 0 }
  ];

  // Предметы с сортировкой по Y вместе с котиками. y — нижний край спрайта ("пол").
  const PROPS = [
    // Ряд у задней стены
    { s: "shelfFull1", x: 4,   y: 64 },
    { s: "boardB",     x: 54,  y: 64 },
    { s: "shelfVase1", x: 156, y: 64 },
    { s: "shelfVase2", x: 207, y: 64 },
    { s: "boardC",     x: 310, y: 64 },
    { s: "shelfFull2", x: 354, y: 64 },
    // Барная стойка
    { s: "longTable",  x: 150, y: 102 },
    { s: "longTable",  x: 206, y: 102 },
    // Стойки у боковых стен
    { s: "armorRack",  x: 6,   y: 120 },
    { s: "weaponRack", x: 350, y: 120 },
    // Столы и стулья
    { s: "tablePlain1", x: 62, y: 156 },
    { s: "chair", x: 69, y: 170 }, { s: "chair", x: 90, y: 170 },
    { s: "tablePlain3", x: 290, y: 156 },
    { s: "chair", x: 297, y: 170 }, { s: "chair", x: 318, y: 170 },
    { s: "deskBook",  x: 60,  y: 215 },
    { s: "chair", x: 69, y: 229 }, { s: "chair", x: 95, y: 229 },
    { s: "deskBook2", x: 284, y: 215 },
    { s: "chair", x: 293, y: 229 }, { s: "chair", x: 319, y: 229 },
    // Диван, сундуки, растения
    { s: "sofa",   x: 346, y: 236 },
    { s: "chestA", x: 10,  y: 236 },
    { s: "plantC", x: 38,  y: 236 },
    { s: "chestB", x: 10,  y: 206 },
    { s: "plantA", x: 8,   y: 176 },
    { s: "plantB", x: 376, y: 176 }
  ];

  // Дополнительные невидимые барьеры: [x0, y0, x1, y1]. Зона за барной стойкой.
  const EXTRA_BLOCKS = [[150, 48, 262, 102]];

  // Готовим список всех прямоугольников-препятствий
  const SOLIDS = [];
  PROPS.forEach((p) => {
    const sp = SPRITES[p.s];
    p.w = sp.r[2];
    p.h = sp.r[3];
    p.left = p.x;
    p.top = p.y - p.h;
    if (sp.b) {
      SOLIDS.push([p.left + sp.b[0], p.top + sp.b[1], p.left + sp.b[0] + sp.b[2], p.top + sp.b[1] + sp.b[3]]);
    }
  });
  EXTRA_BLOCKS.forEach((b) => SOLIDS.push(b));


  // ---- Взаимодействие ----
  // Предметы, с которыми можно что-то сделать (клавиша E), если встать рядом с их основанием.
  const REACH = 16;
  const USABLES = [];
  PROPS.forEach((p) => {
    const sp = SPRITES[p.s];
    if (!sp.use || !sp.b) return;
    USABLES.push({
      type: sp.use,
      rect: [p.left + sp.b[0], p.top + sp.b[1], p.left + sp.b[0] + sp.b[2], p.top + sp.b[1] + sp.b[3]]
    });
  });

  function distToRect(x, y, r) {
    const dx = Math.max(r[0] - x, 0, x - r[2]);
    const dy = Math.max(r[1] - y, 0, y - r[3]);
    return Math.hypot(dx, dy);
  }

  function nearestUsable(x, y) {
    let best = null;
    USABLES.forEach((u) => {
      const d = distToRect(x, y - 2, u.rect);
      if (d <= REACH && (!best || d < best.dist)) best = { type: u.type, dist: d };
    });
    return best;
  }

  const EMOTES = { heart: "\u2764\ufe0f", happy: "\ud83d\ude3a", sleep: "\ud83d\udca4", alert: "\u2757", milk: "\ud83e\udd5b" };
  const KEY_EMOTES = ["heart", "happy", "sleep", "alert"]; // клавиши 1-4
  const PET_RANGE = 30;

  const USE_TEXT = {
    shelf: ["На полке стопка книг: «Сто способов уронить кружку».", "Здесь учебник «Мышиная охота для начинающих». Зачитан до дыр.", "Между томами спрятана рыбная косточка. Кто-то делал закладку."],
    rack: ["Оружие начищено. Когти у котов всё равно острее.", "На табличке: «Лапами не трогать». Ты, конечно, потрогал."],
    plant: ["Кошачья мята! Пахнет божественно.", "Цветок в чёрной вазе. Пока не погрызен."],
    chest: ["Сундук заперт. Внутри что-то шуршит.", "Крышка не поддаётся. На ней следы чьих-то когтей."],
    sofa: ["Мягкий диван. Хочется свернуться клубком."]
  };
  const NOTICES = [
    "Нужны смелые коты: ночная охота на мышей в подвале. Награда — три рыбки.",
    "Найден клубок красной шерсти. Спрашивать у стойки.",
    "Лазерную точку снова видели у северной стены. Охотники, будьте начеку.",
    "Новичкам: подойди к другому коту и нажми E — его можно погладить."
  ];

  function canStand(x, y) {
    if (x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) return false;
    const x0 = x - FOOT.halfW, x1 = x + FOOT.halfW, y0 = y - FOOT.h, y1 = y;
    for (let i = 0; i < SOLIDS.length; i++) {
      const s = SOLIDS[i];
      if (x0 < s[2] && x1 > s[0] && y0 < s[3] && y1 > s[1]) return false;
    }
    return true;
  }

  // Движение по осям отдельно — можно скользить вдоль мебели.
  function resolveMove(x, y, nx, ny) {
    let rx = x, ry = y;
    if (canStand(nx, y)) rx = nx;
    if (canStand(rx, ny)) ry = ny;
    return { x: rx, y: ry };
  }

  function randomSpawn() {
    for (let i = 0; i < 200; i++) {
      const x = 40 + Math.random() * 320;
      const y = 120 + Math.random() * 110;
      if (canStand(x, y)) return { x, y };
    }
    return { x: 200, y: 200 };
  }

  // Котики (Purrfectly Free Pixel Cats): сетка 4 кадра x 3 ряда.
  // Ряд 0 — вниз, 1 — вбок (вправо), 2 — вверх. Влево = зеркало ряда 1.
  const CATS = {
    skins: ["orange", "brown", "white"],
    file: (skin) => "assets/cats/cat_" + skin + ".png",
    cellW: 32, cellH: 30, frames: 4, frameMs: 130,
    rows: {
      down:  { row: 0, cx: 17.5, foot: 25 },
      side:  { row: 1, cx: 19,   foot: 25 },
      up:    { row: 2, cx: 17.5, foot: 28 }
    }
  };

  return { WORLD, BOUNDS, FOOT, SHEETS, SPRITES, STATIC_LAYER, PROPS, SOLIDS, CATS, EMOTES, KEY_EMOTES, PET_RANGE, USE_TEXT, NOTICES, nearestUsable, canStand, resolveMove, randomSpawn };
});
