import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;
const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}

// ── Persistence helpers ──────────────────────────────────────────────────────

const loadLeaderboard = (): LeaderboardEntry[] => {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      return JSON.parse(raw) as LeaderboardEntry[];
    }
  } catch (e) {
    console.warn("Could not read leaderboard file, starting fresh:", e);
  }
  // Seed data so there's always something to show
  return [
    { name: "ACE", score: 8500, level: 5, date: new Date().toISOString() },
    { name: "BLAZE", score: 5200, level: 4, date: new Date().toISOString() },
    { name: "RESCUE", score: 3100, level: 3, date: new Date().toISOString() },
  ];
};

const saveLeaderboard = (data: LeaderboardEntry[]) => {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Could not save leaderboard:", e);
  }
};

let leaderboard: LeaderboardEntry[] = loadLeaderboard();

// ── API ───────────────────────────────────────────────────────────────────────

app.use(express.json());

app.get("/api/leaderboard", (_req, res) => {
  res.json(leaderboard);
});

app.post("/api/leaderboard", (req, res) => {
  const { name, score, level } = req.body as { name?: string; score?: number; level?: number };

  if (!name || typeof score !== "number" || score < 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  const entry: LeaderboardEntry = {
    name: String(name).slice(0, 12).toUpperCase(),
    score,
    level: level ?? 1,
    date: new Date().toISOString(),
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10);

  saveLeaderboard(leaderboard);

  // Broadcast to all connected clients
  const message = JSON.stringify({ type: "LEADERBOARD_UPDATE", data: leaderboard });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });

  res.json(leaderboard);
});

// ── Vite middleware ───────────────────────────────────────────────────────────

async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => res.sendFile("dist/index.html", { root: "." }));
  }
}

setupVite().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Leaderboard stored at: ${LEADERBOARD_FILE}`);
  });
});
