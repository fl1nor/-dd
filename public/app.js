const socket = io();
const World = window.MeowWorld;
const S = World.WORLD.scale;

const loginScreen = document.getElementById("login-screen");
const gameScreen = document.getElementById("game-screen");
const loginForm = document.getElementById("login-form");
const loginButton = loginForm.querySelector("button[type=submit]");
const loginNote = document.querySelector(".tiny-note");
const nicknameInput = document.getElementById("nickname");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const membersEl = document.getElementById("members");
const onlineCount = document.getElementById("online-count");
const memberCount = document.getElementById("member-count");
const toastEl = document.getElementById("toast");
const noticeEl = document.getElementById("notice");
const noticeList = document.getElementById("notice-list");
const emoteBar = document.getElementById("emote-bar");
const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

let myId = null;
let joined = false;
let players = new Map();
const keys = new Set();
const bubbles = new Map();
const effects = []; // эмодзи над котиками: { id, emoji, start, until }
let lastInteract = 0;
let toastTimer = null;
const speed = 1.25; // пикселей мира за тик (30 мс) ≈ прежние 2.5 px при масштабе x2

/* ---------- Загрузка спрайтов ---------- */

const sheets = {};
const catImages = {};
let assetsReady = false;
let staticLayer = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить " + src));
    img.src = src;
  });
}

const assetsPromise = (async () => {
  const jobs = [];
  Object.entries(World.SHEETS).forEach(([name, src]) => jobs.push(loadImage(src).then((img) => (sheets[name] = img))));
  World.CATS.skins.forEach((skin) => jobs.push(loadImage(World.CATS.file(skin)).then((img) => (catImages[skin] = img))));
  await Promise.all(jobs);
  buildStaticLayer();
  assetsReady = true;
})();

assetsPromise.then(
  () => { loginButton.disabled = false; },
  (err) => {
    console.error(err);
    loginNote.textContent = "⚠ Не удалось загрузить картинки таверны. Обнови страницу.";
  }
);
loginButton.disabled = true;

function drawSprite(c, name, x, y) {
  const sp = World.SPRITES[name];
  const r = sp.r;
  c.drawImage(sheets[sp.sheet], r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
}

// Пол, стена, коврик, баннер и окна не меняются — рисуем один раз.
function buildStaticLayer() {
  const { width, height, wallH } = World.WORLD;
  staticLayer = document.createElement("canvas");
  staticLayer.width = width;
  staticLayer.height = height;
  const c = staticLayer.getContext("2d");
  c.imageSmoothingEnabled = false;

  const floor = World.SPRITES.floorTile.r;
  for (let y = wallH; y < height; y += floor[3]) {
    for (let x = 0; x < width; x += floor[2]) drawSprite(c, "floorTile", x, y);
  }
  const wall = World.SPRITES.wallPlain.r;
  for (let x = 0; x < width; x += wall[2]) drawSprite(c, "wallPlain", x, 0);

  World.STATIC_LAYER.forEach((item) => drawSprite(c, item.s, item.x, item.y));
}

/* ---------- Отрисовка ---------- */

function drawCat(p) {
  const C = World.CATS;
  const img = catImages[p.skin] || catImages.orange;
  const dir = p.dir || "down";
  const row = C.rows[dir === "up" ? "up" : dir === "down" ? "down" : "side"];
  const now = Date.now();
  const moving = p.movingUntil && now < p.movingUntil;
  const frame = moving ? Math.floor(now / C.frameMs) % C.frames : 0;
  const sx = frame * C.cellW;
  const sy = row.row * C.cellH;
  const x = Math.round(p.x);
  const y = Math.round(p.y);

  // Мягкая тень под лапками
  ctx.fillStyle = "rgba(20, 12, 8, 0.28)";
  ctx.fillRect(x - 6, y - 1, 12, 2);
  ctx.fillRect(x - 8, y, 16, 1);

  const top = y - row.foot;
  if (dir === "left") {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, C.cellW, C.cellH, -row.cx, top, C.cellW, C.cellH);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, C.cellW, C.cellH, x - row.cx, top, C.cellW, C.cellH);
  }
}

// Подписи и облачки рисуем в экранных координатах, чтобы текст был чётким.
function drawLabels(p, isMe) {
  const x = Math.round(p.x) * S;
  const y = Math.round(p.y) * S;

  // Эмодзи-реакции поднимаются над головой и исчезают
  const now = Date.now();
  effects.forEach((fx) => {
    if (fx.id !== p.id || now > fx.until) return;
    const t = (now - fx.start) / (fx.until - fx.start);
    ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.font = "24px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fx.emoji, x, y - 34 * S - t * 18);
    ctx.globalAlpha = 1;
  });

  const bubble = bubbles.get(p.id);
  if (bubble && Date.now() < bubble.until) {
    ctx.font = "16px 'VT323', monospace";
    ctx.textAlign = "center";
    const text = bubble.text.slice(0, 40);
    const width = Math.min(210, Math.max(54, ctx.measureText(text).width + 16));
    const by = y - 28 * S - 26;
    ctx.fillStyle = "#f3e5c7"; ctx.fillRect(x - width / 2, by, width, 25);
    ctx.fillStyle = "#fff3d9"; ctx.fillRect(x - width / 2 + 3, by + 3, width - 6, 19);
    ctx.fillRect(x - 3, by + 25, 7, 7);
    ctx.fillStyle = "#39251a";
    ctx.fillText(text, x, by + 17);
  }

  ctx.font = "13px 'VT323', monospace";
  ctx.textAlign = "center";
  const w = ctx.measureText(p.name).width + 12;
  ctx.fillStyle = "rgba(33, 21, 13, 0.87)";
  ctx.fillRect(x - w / 2, y + 6, w, 15);
  ctx.fillStyle = isMe ? "#f3d28f" : "#f0e1c3";
  ctx.fillText(p.name, x, y + 18);
  if (isMe) { ctx.fillStyle = "#f0ce85"; ctx.fillRect(x - 2, y + 24, 4, 3); }
}

function render() {
  requestAnimationFrame(render);
  if (!assetsReady) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(staticLayer, 0, 0, staticLayer.width * S, staticLayer.height * S);

  // Мебель и котики вместе, по нижнему краю — кто ниже, тот ближе к зрителю.
  const drawList = World.PROPS.map((p) => ({ y: p.y, draw: () => drawSprite(ctx, p.s, p.left, p.top) }));
  players.forEach((p) => drawList.push({ y: p.y + 0.01, draw: () => drawCat(p) }));
  drawList.sort((a, b) => a.y - b.y);

  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawList.forEach((item) => item.draw());

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = effects.length - 1; i >= 0; i--) if (Date.now() > effects[i].until) effects.splice(i, 1);
  [...players.values()].sort((a, b) => a.y - b.y).forEach((p) => drawLabels(p, p.id === myId));
  drawHint();
}

/* ---------- Взаимодействие ---------- */

// Что сейчас рядом с моим котом: другой кот (погладить) или предмет таверны.
function currentTarget() {
  const me = players.get(myId);
  if (!me || !joined) return null;
  let cat = null, catDist = World.PET_RANGE - 4;
  players.forEach((p) => {
    if (p.id === myId) return;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < catDist) { catDist = d; cat = p; }
  });
  const item = World.nearestUsable(me.x, me.y);
  if (cat && (!item || catDist <= item.dist + 6)) return { kind: "cat", cat, label: "погладить " + cat.name };
  if (item) {
    const labels = { board: "читать объявления", bar: "попросить молока", shelf: "осмотреть полку", rack: "осмотреть", plant: "понюхать", chest: "открыть сундук", sofa: "потрогать диван" };
    return { kind: "use", type: item.type, label: labels[item.type] || "осмотреть" };
  }
  return null;
}

function drawHint() {
  if (!joined || !noticeEl.classList.contains("hidden")) return;
  const me = players.get(myId);
  const target = currentTarget();
  if (!me || !target) return;
  const bubble = bubbles.get(myId);
  if (bubble && Date.now() < bubble.until) return;
  const text = "E — " + target.label;
  const x = Math.round(me.x) * S;
  const y = Math.round(me.y) * S - 30 * S;
  ctx.font = "15px 'VT323', monospace";
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(33, 21, 13, 0.92)"; ctx.fillRect(x - w / 2, y - 14, w, 19);
  ctx.fillStyle = "#f3d28f"; ctx.fillText(text, x, y);
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

function addEffect(id, emoji) {
  const start = Date.now();
  effects.push({ id, emoji, start, until: start + 2000 });
}

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

function closeNotice() { noticeEl.classList.add("hidden"); }

function openNotice() {
  noticeList.innerHTML = "";
  World.NOTICES.forEach((line) => { const li = document.createElement("li"); li.textContent = line; noticeList.append(li); });
  keys.clear();
  noticeEl.classList.remove("hidden");
}

function interact() {
  if (!joined || Date.now() - lastInteract < 350) return;
  const target = currentTarget();
  if (!target) return;
  lastInteract = Date.now();
  if (target.kind === "cat") { socket.emit("pet", { to: target.cat.id }); return; }
  if (target.type === "board") openNotice();
  else if (target.type === "bar") { socket.emit("emote", { id: "milk" }); showToast("Бармен наливает тебе блюдце молока."); }
  else showToast(pick(World.USE_TEXT[target.type] || ["Ничего интересного."]));
}

function sendEmote(id) { if (joined) socket.emit("emote", { id }); }

World.KEY_EMOTES.forEach((id, i) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = "<small>" + (i + 1) + "</small>" + World.EMOTES[id];
  btn.addEventListener("click", () => { sendEmote(id); btn.blur(); });
  emoteBar.append(btn);
});

/* ---------- Список гильдейцев ---------- */

function updateMembers() {
  const list = [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
  membersEl.innerHTML = "";
  list.forEach((p) => {
    const row = document.createElement("div"); row.className = "member";
    const swatch = document.createElement("span"); swatch.className = "member-swatch"; swatch.style.background = p.color;
    const name = document.createElement("span"); name.textContent = p.name + (p.id === myId ? " (ты)" : "");
    const status = document.createElement("small"); status.textContent = "●";
    row.append(swatch, name, status); membersEl.append(row);
  });
  onlineCount.textContent = list.length; memberCount.textContent = list.length;
}

/* ---------- Сеть и ввод ---------- */

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nicknameInput.value.trim().slice(0, 18);
  if (!name || !assetsReady) return;
  socket.emit("join", { name });
});

socket.on("welcome", (data) => {
  myId = data.id; players = new Map(data.players.map((p) => [p.id, p]));
  joined = true; loginScreen.classList.add("hidden"); gameScreen.classList.remove("hidden");
  updateMembers(); nicknameInput.blur();
});
socket.on("player-joined", (p) => { players.set(p.id, p); updateMembers(); });
socket.on("player-left", (id) => { players.delete(id); bubbles.delete(id); updateMembers(); });
socket.on("player-moved", (p) => {
  const player = players.get(p.id);
  if (!player) return;
  player.x = p.x; player.y = p.y; player.dir = p.dir || player.dir;
  if (p.moved) player.movingUntil = Date.now() + 160;
});
socket.on("player-emote", (data) => {
  if (World.EMOTES[data.emote]) addEffect(data.id, World.EMOTES[data.emote]);
});
socket.on("player-pet", (data) => {
  addEffect(data.from, World.EMOTES.heart);
  addEffect(data.to, World.EMOTES.heart);
  const from = players.get(data.from);
  if (data.to === myId && from) showToast(from.name + " гладит тебя. Мур-р!");
});
socket.on("player-chat", (data) => {
  bubbles.set(data.id, { text: data.message, until: Date.now() + 5000 });
});

window.addEventListener("keydown", (e) => {
  if (joined && document.activeElement !== chatInput) {
    const k = e.key.toLowerCase();
    if (!noticeEl.classList.contains("hidden")) {
      if (k === "escape" || k === "e") closeNotice();
      e.preventDefault();
      return;
    }
    if (k === "e" || k === "у") { interact(); return; }
    if (k >= "1" && k <= "9" && World.KEY_EMOTES[Number(k) - 1]) { sendEmote(World.KEY_EMOTES[Number(k) - 1]); return; }
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key) && joined && document.activeElement !== chatInput) e.preventDefault();
  if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key.toLowerCase()) && joined && document.activeElement !== chatInput) keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

setInterval(() => {
  if (!joined || !myId) return;
  const me = players.get(myId); if (!me) return;
  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= speed;
  if (keys.has("s") || keys.has("arrowdown")) dy += speed;
  if (keys.has("a") || keys.has("arrowleft")) dx -= speed;
  if (keys.has("d") || keys.has("arrowright")) dx += speed;
  if ((!dx && !dy) || !noticeEl.classList.contains("hidden")) return;
  // Заранее проверяем столкновения, чтобы не засыпать сервер упирающимися шагами.
  const next = World.resolveMove(me.x, me.y, me.x + dx, me.y + dy);
  if (next.x !== me.x || next.y !== me.y) socket.emit("move", next);
}, 30);

chatForm.addEventListener("submit", (e) => {
  e.preventDefault(); const message = chatInput.value.trim(); if (!message) return;
  socket.emit("chat", message); chatInput.value = "";
});
document.getElementById("leave-button").addEventListener("click", () => location.reload());
render();
