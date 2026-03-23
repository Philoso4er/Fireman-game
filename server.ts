import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = createServer(app);

// noServer:true — we manually route upgrades by path
// This prevents Vite's HMR socket from being intercepted (which was the
// root cause of leaderboard updates never reaching the client).
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if ((req.url ?? '') === '/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  }
  // All other paths (Vite HMR uses /__vite_hmr) fall through untouched
});

const PORT = 3000;
const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");

interface LeaderboardEntry { name:string; score:number; level:number; date:string; }

const loadLeaderboard = (): LeaderboardEntry[] => {
  try {
    if (fs.existsSync(LEADERBOARD_FILE))
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf-8"));
  } catch (e) { console.warn("Could not read leaderboard:", e); }
  return [
    { name:"ACE",    score:8500, level:5, date:new Date().toISOString() },
    { name:"BLAZE",  score:5200, level:4, date:new Date().toISOString() },
    { name:"RESCUE", score:3100, level:3, date:new Date().toISOString() },
  ];
};

const saveLeaderboard = (data: LeaderboardEntry[]) => {
  try { fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data,null,2)); }
  catch (e) { console.error("Could not save leaderboard:", e); }
};

let leaderboard = loadLeaderboard();

const broadcast = (data: LeaderboardEntry[]) => {
  const msg = JSON.stringify({ type:"LEADERBOARD_UPDATE", data });
  wss.clients.forEach(c => { if(c.readyState===WebSocket.OPEN) c.send(msg); });
};

app.use(express.json());

app.get("/api/leaderboard", (_req, res) => { res.json(leaderboard); });

app.post("/api/leaderboard", (req, res) => {
  const { name, score, level } = req.body as any;
  if (!name || typeof score !== "number" || score < 0)
    return res.status(400).json({ error:"Invalid data" });
  leaderboard.push({ name:String(name).slice(0,12).toUpperCase(), score, level:level??1, date:new Date().toISOString() });
  leaderboard.sort((a,b)=>b.score-a.score);
  leaderboard = leaderboard.slice(0,10);
  saveLeaderboard(leaderboard);
  broadcast(leaderboard);
  res.json(leaderboard);
});

async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode:true, hmr:{ path:'/__vite_hmr' } },
      appType:"spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req,res)=>res.sendFile("dist/index.html",{root:"."}));
  }
}

setupVite().then(()=>{
  server.listen(PORT,"0.0.0.0",()=>{
    console.log(`Server  → http://localhost:${PORT}`);
    console.log(`WS      → ws://localhost:${PORT}/ws`);
    console.log(`Scores  → ${LEADERBOARD_FILE}`);
  });
});
