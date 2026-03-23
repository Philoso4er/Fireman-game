import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app    = express();
const server = createServer(app);
const PORT   = 3000;

const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────
const loadLeaderboard = (): LeaderboardEntry[] => {
  try {
    if (fs.existsSync(LEADERBOARD_FILE))
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf-8"));
  } catch (e) {
    console.warn("Could not read leaderboard file:", e);
  }
  return [
    { name: "ACE",    score: 8500, level: 5, date: new Date().toISOString() },
    { name: "BLAZE",  score: 5200, level: 4, date: new Date().toISOString() },
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

let leaderboard = loadLeaderboard();

// ── API ───────────────────────────────────────────────────────────────────────
app.use(express.json());

// Permissive CORS so the leaderboard works in any hosting setup
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.options("/api/leaderboard", (_req, res) => res.sendStatus(200));

app.get("/api/leaderboard", (_req, res) => {
  res.json(leaderboard);
});

app.post("/api/leaderboard", (req, res) => {
  const { name, score, level } = req.body as {
    name?: string; score?: number; level?: number;
  };

  if (!name || typeof score !== "number" || score < 0)
    return res.status(400).json({ error: "Invalid data" });

  const entry: LeaderboardEntry = {
    name:  String(name).slice(0, 12).toUpperCase(),
    score,
    level: level ?? 1,
    date:  new Date().toISOString(),
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10);
  saveLeaderboard(leaderboard);

  console.log(`[Leaderboard] New entry: ${entry.name} — ${entry.score} pts (floor ${entry.level})`);
  console.log(`[Leaderboard] Top 3: ${leaderboard.slice(0,3).map(e=>`${e.name}:${e.score}`).join(', ')}`);

  res.json(leaderboard);
});

// ── Vite (dev) / Static (prod) ────────────────────────────────────────────────
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
    console.log(`Server running → http://localhost:${PORT}`);
    console.log(`Leaderboard   → ${LEADERBOARD_FILE}`);
  });
});
