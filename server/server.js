require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const logger = require("./utils/logger");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const { setupSocket, roomParticipants } = require("./socket/handler");

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "1mb" }));

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", apiLimiter);

// REST API routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Group video calling server is running" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeRooms: roomParticipants.size,
  });
});

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

setupSocket(io);

// Connect to MongoDB then start server
const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`CORS origin: ${CORS_ORIGIN}`);
  });
});
