import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
}

let leaderboard: LeaderboardEntry[] = [
  { name: "Ace", score: 5000, level: 5 },
  { name: "Blaze", score: 3500, level: 3 },
  { name: "Rescue", score: 2000, level: 2 }
];

app.use(express.json());

// API routes
app.get("/api/leaderboard", (req, res) => {
  res.json(leaderboard);
});

app.post("/api/leaderboard", (req, res) => {
  const { name, score, level } = req.body;
  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: "Invalid data" });
  }
  
  leaderboard.push({ name, score, level });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10); // Keep top 10
  
  // Broadcast update
  const message = JSON.stringify({ type: 'LEADERBOARD_UPDATE', data: leaderboard });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  res.json(leaderboard);
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }
}

setupVite().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
