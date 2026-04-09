require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");

const connectDB = require("./config/db");
const Message = require("./models/Message");

const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required in your environment variables.");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/messages", async (_req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

const clientDistPath = path.resolve(__dirname, "../../client/dist");
const hasClientBuild = fs.existsSync(clientDistPath);

if (hasClientBuild) {
  app.use(express.static(clientDistPath));

  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/messages") || req.path === "/health") {
      next();
      return;
    }

    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const data = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

wss.on("connection", async (socket) => {
  console.log("WebSocket client connected");

  try {
    const latestMessages = await Message.find().sort({ createdAt: -1 }).limit(50);
    socket.send(
      JSON.stringify({
        type: "chat_history",
        payload: latestMessages.reverse(),
      })
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        type: "error",
        payload: "Failed to load chat history",
      })
    );
  }

  socket.on("message", async (rawData) => {
    try {
      const parsed = JSON.parse(rawData.toString());

      if (parsed.type !== "chat_message") {
        return;
      }

      const username = String(parsed.payload?.username || "").trim();
      const text = String(parsed.payload?.text || "").trim();

      if (!username || !text) {
        socket.send(
          JSON.stringify({
            type: "error",
            payload: "username and text are required",
          })
        );
        return;
      }

      const savedMessage = await Message.create({ username, text });

      broadcast({
        type: "chat_message",
        payload: savedMessage,
      });
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "error",
          payload: "Invalid message payload",
        })
      );
    }
  });

  socket.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

async function start() {
  await connectDB(MONGODB_URI);
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
