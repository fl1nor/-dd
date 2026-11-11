const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const World = require("./public/shared/world.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const players = new Map();
const MAP = { width: World.WORLD.width, height: World.WORLD.height };
const MAX_STEP = 6; // максимум пикселей за одно сообщение — защита от телепортации

// Цвет в списке гильдейцев соответствует шерсти кота
const SKIN_COLORS = { orange: "#d99a5b", brown: "#8b5a3c", white: "#e8e2d4" };

// Простейшее ограничение частоты действий на одного игрока.
function allowed(player, key, ms) {
  const now = Date.now();
  player.last = player.last || {};
  if (now - (player.last[key] || 0) < ms) return false;
  player.last[key] = now;
  return true;
}

function cleanText(value, max = 18) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function directionOf(dx, dy, prev) {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

io.on("connection", (socket) => {
  socket.on("join", (payload) => {
    const name = cleanText(payload && payload.name, 18) || "Котик";
    const skin = World.CATS.skins[Math.floor(Math.random() * World.CATS.skins.length)];
    const player = {
      id: socket.id,
      name,
      ...World.randomSpawn(),
      skin,
      color: SKIN_COLORS[skin],
      dir: "down",
      message: ""
    };

    players.set(socket.id, player);
    socket.emit("welcome", { id: socket.id, players: [...players.values()], map: MAP });
    socket.broadcast.emit("player-joined", player);
  });

  socket.on("move", (position) => {
    const player = players.get(socket.id);
    if (!player || !position) return;
    const tx = Number(position.x), ty = Number(position.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;

    // Ограничиваем шаг и проверяем столкновения с мебелью на сервере.
    const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, tx - player.x));
    const dy = Math.max(-MAX_STEP, Math.min(MAX_STEP, ty - player.y));
    const next = World.resolveMove(player.x, player.y, player.x + dx, player.y + dy);
    const moved = next.x !== player.x || next.y !== player.y;

    player.dir = directionOf(next.x - player.x, next.y - player.y, player.dir);
    player.x = next.x;
    player.y = next.y;
    io.emit("player-moved", { id: socket.id, x: player.x, y: player.y, dir: player.dir, moved });
  });

  socket.on("emote", (payload) => {
    const player = players.get(socket.id);
    const id = payload && payload.id;
    if (!player || !Object.prototype.hasOwnProperty.call(World.EMOTES, id)) return;
    if (!allowed(player, "emote", 500)) return;
    io.emit("player-emote", { id: socket.id, emote: id });
  });

  // Погладить другого кота: нужно стоять рядом (проверяем на сервере).
  socket.on("pet", (payload) => {
    const player = players.get(socket.id);
    const target = players.get(payload && payload.to);
    if (!player || !target || target.id === player.id) return;
    if (Math.hypot(player.x - target.x, player.y - target.y) > World.PET_RANGE) return;
    if (!allowed(player, "pet", 1000)) return;
    io.emit("player-pet", { from: player.id, to: target.id });
  });

  socket.on("chat", (raw) => {
    const player = players.get(socket.id);
    if (!player) return;
    const message = cleanText(raw, 90);
    if (!message) return;
    io.emit("player-chat", { id: socket.id, message });
  });

  socket.on("disconnect", () => {
    if (players.delete(socket.id)) io.emit("player-left", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`MEOW tavern is running at http://localhost:${PORT}`);
});
