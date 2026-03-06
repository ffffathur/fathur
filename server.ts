import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("queue.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS queue_state (
    type TEXT PRIMARY KEY,
    current_number INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS call_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    number INTEGER,
    counter INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO queue_state (type, current_number) VALUES ('UMUM', 0);
  INSERT OR IGNORE INTO queue_state (type, current_number) VALUES ('BPJS', 0);
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/state", (req, res) => {
    const state = db.prepare("SELECT * FROM queue_state").all();
    const lastCall = db.prepare("SELECT * FROM call_history ORDER BY timestamp DESC LIMIT 1").get();
    res.json({ state, lastCall });
  });

  app.post("/api/reset", (req, res) => {
    db.prepare("UPDATE queue_state SET current_number = 0").run();
    db.prepare("DELETE FROM call_history").run();
    io.emit("state_updated", { state: [{ type: 'UMUM', current_number: 0 }, { type: 'BPJS', current_number: 0 }], lastCall: null });
    res.json({ success: true });
  });

  // WebSocket Logic
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("call_next", (data: { type: 'UMUM' | 'BPJS', counter: number }) => {
      const { type, counter } = data;
      
      // Increment number
      db.prepare("UPDATE queue_state SET current_number = current_number + 1 WHERE type = ?").run(type);
      const newState = db.prepare("SELECT current_number FROM queue_state WHERE type = ?").get(type) as { current_number: number };
      
      // Record history
      db.prepare("INSERT INTO call_history (type, number, counter) VALUES (?, ?, ?)").run(type, newState.current_number, counter);
      
      const allState = db.prepare("SELECT * FROM queue_state").all();
      const lastCall = { type, number: newState.current_number, counter };
      
      io.emit("state_updated", { state: allState, lastCall });
      io.emit("new_call", lastCall);
    });

    socket.on("recall", (data: { type: 'UMUM' | 'BPJS', number: number, counter: number }) => {
      io.emit("new_call", data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
