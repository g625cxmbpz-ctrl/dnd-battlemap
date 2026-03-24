// ================================================================
//  DUNGEON CARTOGRAPHER — WebSocket Session Server
//  Phase 5: Multiplayer
//
//  Usage:
//    node server.js            (default port 8765)
//    PORT=3000 node server.js  (custom port)
//
//  Install dependency first: npm install ws
// ================================================================
"use strict";

const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8765;
const wss = new WebSocketServer({ port: PORT });

// Full map state cached so new joiners receive current state
let sharedState = null;

// Track all connected clients: ws → { id, name, color }
let nextClientId = 1;
const clients = new Map();

// ── Helpers ──────────────────────────────────────────────────────

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/** Broadcast to everyone, or everyone except `exclude` */
function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === 1) ws.send(data);
  }
}

/** Send updated user list to all clients */
function broadcastUserList() {
  const users = [...clients.values()].map(({ id, name, color }) => ({ id, name, color }));
  const data = JSON.stringify({ type: "user_list", users });
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ── Connection handler ────────────────────────────────────────────

wss.on("connection", (ws) => {
  const id = nextClientId++;
  clients.set(ws, { id, name: `Player ${id}`, color: "#c8c0b0" });

  console.log(`[+] Client ${id} connected  (${clients.size} total)`);

  // Tell this client their assigned ID
  send(ws, { type: "your_id", id });

  // Send them the current map state (if any)
  if (sharedState) {
    send(ws, { type: "full_state", state: sharedState });
  }

  // Announce updated user roster to everyone
  broadcastUserList();

  // ── Incoming messages ──
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Client updating their display name / color
    if (msg.type === "client_info") {
      const info = clients.get(ws);
      if (info) {
        if (msg.name)  info.name  = String(msg.name).slice(0, 24);
        if (msg.color) info.color = String(msg.color).slice(0, 9);
        clients.set(ws, info);
        broadcastUserList();
      }
      return;
    }

    // Cache latest full map so new joiners get it
    if (msg.type === "full_state") {
      sharedState = msg.state;
    }

    // Relay everything else to all other clients
    broadcast(msg, ws);
  });

  // ── Disconnect ──
  ws.on("close", () => {
    const info = clients.get(ws);
    clients.delete(ws);
    if (info) {
      console.log(`[-] Client ${info.id} disconnected  (${clients.size} remaining)`);
      broadcast({ type: "cursor_leave", clientId: info.id });
    }
    broadcastUserList();
  });

  ws.on("error", (err) => {
    console.error(`[!] WebSocket error:`, err.message);
    clients.delete(ws);
    broadcastUserList();
  });
});

console.log(`\n⚔  Dungeon Cartographer Session Server`);
console.log(`   Listening on  ws://localhost:${PORT}`);
console.log(`   Share this address with your players.\n`);
