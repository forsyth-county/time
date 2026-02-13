const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const Room = require("../models/Room");
const { generateShortId } = require("../utils/generateId");
const logger = require("../utils/logger");

// In-memory room state: roomId -> Map<socketId, { userId, username, muted, videoOff, handRaised, screenSharing }>
const roomParticipants = new Map();

// Simple in-memory chat rate limiter: socketId -> { count, resetAt }
const chatLimiter = new Map();
const CHAT_RATE_LIMIT = 10; // messages per window
const CHAT_RATE_WINDOW = 10000; // 10 seconds

function checkChatRate(socketId) {
  const now = Date.now();
  let entry = chatLimiter.get(socketId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + CHAT_RATE_WINDOW };
    chatLimiter.set(socketId, entry);
  }
  entry.count++;
  return entry.count <= CHAT_RATE_LIMIT;
}

// Max payload size for relayed signaling data (64 KB)
const MAX_PAYLOAD_SIZE = 65536;

function isValidPayload(data) {
  if (data === null || data === undefined) return false;
  try {
    return JSON.stringify(data).length <= MAX_PAYLOAD_SIZE;
  } catch {
    return false;
  }
}

function getParticipantList(roomId) {
  const participants = roomParticipants.get(roomId);
  if (!participants) return [];
  return Array.from(participants.entries()).map(([socketId, info]) => ({
    socketId,
    userId: info.userId,
    username: info.username,
    muted: info.muted,
    videoOff: info.videoOff,
    handRaised: info.handRaised,
    screenSharing: info.screenSharing,
  }));
}

function setupSocket(io) {
  // JWT auth middleware — supports guest mode
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.data.userId = decoded.id;
        socket.data.authenticated = true;
      } catch {
        // Invalid token → guest mode
        socket.data.userId = null;
        socket.data.authenticated = false;
      }
    } else {
      socket.data.userId = null;
      socket.data.authenticated = false;
    }

    // Guest username with unique suffix
    if (!socket.data.authenticated) {
      socket.data.username = `Guest_${generateShortId(6)}`;
      socket.data.isGuest = true;
    }

    next();
  });

  io.on("connection", async (socket) => {
    // Resolve username for authenticated users
    if (socket.data.authenticated && socket.data.userId) {
      try {
        const User = require("../models/User");
        const user = await User.findById(socket.data.userId).select("username");
        socket.data.username = user ? user.username : `User_${socket.data.userId}`;
      } catch {
        socket.data.username = `User_${socket.data.userId}`;
      }
    }

    logger.info("Socket connected", {
      socketId: socket.id,
      username: socket.data.username,
      authenticated: socket.data.authenticated,
    });

    // ─── JOIN ROOM ───
    socket.on("join-room", async ({ roomId } = {}) => {
      if (!roomId || typeof roomId !== "string" || roomId.length > 128) {
        socket.emit("error-message", { message: "Valid roomId is required" });
        return;
      }

      // Leave previous room
      if (socket.data.roomId) {
        leaveRoom(io, socket);
      }

      socket.join(roomId);
      socket.data.roomId = roomId;

      if (!roomParticipants.has(roomId)) {
        roomParticipants.set(roomId, new Map());
      }

      const participants = roomParticipants.get(roomId);
      participants.set(socket.id, {
        userId: socket.data.userId,
        username: socket.data.username,
        muted: false,
        videoOff: false,
        handRaised: false,
        screenSharing: false,
      });

      // Notify existing participants
      socket.to(roomId).emit("user-joined", {
        socketId: socket.id,
        userId: socket.data.userId,
        username: socket.data.username,
      });

      // Send current participants list to the new joiner
      socket.emit("room-participants", getParticipantList(roomId));

      logger.info("User joined room", {
        socketId: socket.id,
        username: socket.data.username,
        roomId,
        participantCount: participants.size,
      });
    });

    // ─── WEBRTC SIGNALING ───
    socket.on("offer", ({ to, offer }) => {
      if (!to || !offer || !isValidPayload(offer)) return;
      io.to(to).emit("offer", {
        from: socket.id,
        offer,
      });
    });

    socket.on("answer", ({ to, answer }) => {
      if (!to || !answer || !isValidPayload(answer)) return;
      io.to(to).emit("answer", {
        from: socket.id,
        answer,
      });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      if (!to || !candidate || !isValidPayload(candidate)) return;
      io.to(to).emit("ice-candidate", {
        from: socket.id,
        candidate,
      });
    });

    // ─── CHAT ───
    socket.on("chat-message", async ({ roomId, message } = {}) => {
      if (!roomId || !message || typeof message !== "string") return;

      const trimmed = message.trim();
      if (trimmed.length === 0 || trimmed.length > 1000) return;

      if (!checkChatRate(socket.id)) {
        socket.emit("error-message", { message: "Chat rate limit exceeded. Slow down." });
        return;
      }

      const chatMsg = {
        messageId: generateShortId(),
        userId: socket.data.userId || null,
        username: socket.data.username,
        message: trimmed,
        timestamp: new Date(),
        reactions: {},
      };

      // Persist to DB (fire and forget, don't block)
      Room.updateOne(
        { roomId },
        { $push: { chatMessages: chatMsg } }
      ).catch((err) => logger.error("Chat persist error", { error: err.message }));

      io.to(roomId).emit("chat-message", chatMsg);
    });

    // ─── CHAT REACTION ───
    socket.on("chat-reaction", async ({ roomId, messageId, emoji } = {}) => {
      if (!roomId || !messageId || !emoji || typeof emoji !== "string") return;
      if (emoji.length > 10) return;

      const userId = socket.data.userId;
      if (!userId) {
        socket.emit("error-message", { message: "Must be authenticated to react" });
        return;
      }

      // Update in DB
      Room.updateOne(
        { roomId, "chatMessages.messageId": messageId },
        { $addToSet: { [`chatMessages.$.reactions.${emoji}`]: userId } }
      ).catch((err) => logger.error("Reaction persist error", { error: err.message }));

      io.to(roomId).emit("chat-reaction", {
        messageId,
        emoji,
        userId,
        username: socket.data.username,
      });
    });

    // ─── MEDIA TOGGLES ───
    socket.on("toggle-mute", ({ roomId, muted } = {}) => {
      if (!roomId || typeof muted !== "boolean") return;
      const participants = roomParticipants.get(roomId);
      if (participants && participants.has(socket.id)) {
        participants.get(socket.id).muted = muted;
        socket.to(roomId).emit("user-toggle-mute", {
          socketId: socket.id,
          muted,
        });
      }
    });

    socket.on("toggle-video", ({ roomId, videoOff } = {}) => {
      if (!roomId || typeof videoOff !== "boolean") return;
      const participants = roomParticipants.get(roomId);
      if (participants && participants.has(socket.id)) {
        participants.get(socket.id).videoOff = videoOff;
        socket.to(roomId).emit("user-toggle-video", {
          socketId: socket.id,
          videoOff,
        });
      }
    });

    // ─── SCREEN SHARING ───
    socket.on("screen-share-start", ({ roomId } = {}) => {
      if (!roomId) return;
      const participants = roomParticipants.get(roomId);
      if (participants && participants.has(socket.id)) {
        participants.get(socket.id).screenSharing = true;
        socket.to(roomId).emit("user-screen-share-start", {
          socketId: socket.id,
          username: socket.data.username,
        });
      }
    });

    socket.on("screen-share-stop", ({ roomId } = {}) => {
      if (!roomId) return;
      const participants = roomParticipants.get(roomId);
      if (participants && participants.has(socket.id)) {
        participants.get(socket.id).screenSharing = false;
        socket.to(roomId).emit("user-screen-share-stop", {
          socketId: socket.id,
        });
      }
    });

    // ─── HAND RAISE ───
    socket.on("hand-raise", ({ roomId, raised } = {}) => {
      if (!roomId || typeof raised !== "boolean") return;
      const participants = roomParticipants.get(roomId);
      if (participants && participants.has(socket.id)) {
        participants.get(socket.id).handRaised = raised;
        socket.to(roomId).emit("user-hand-raise", {
          socketId: socket.id,
          username: socket.data.username,
          raised,
        });
      }
    });

    // ─── WAITING ROOM MANAGEMENT (host only) ───
    async function handleWaitingRoomAction(socket, roomId, userId, action) {
      const room = await Room.findOne({ roomId });
      if (!room || String(room.creator) !== String(socket.data.userId)) {
        socket.emit("error-message", { message: "Only room creator can manage waiting room" });
        return null;
      }

      room.waitingRoom = room.waitingRoom.filter((id) => String(id) !== String(userId));
      await room.save();

      // Notify the target user
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find(
        (s) => s.data.userId && s.data.userId.toString() === userId.toString()
      );
      if (targetSocket) {
        targetSocket.emit(`waiting-room-${action}`, { roomId });
      }

      socket.emit("waiting-room-updated", {
        waitingRoom: room.waitingRoom,
      });
    }

    socket.on("approve-user", async ({ roomId, userId } = {}) => {
      if (!roomId || !userId) return;
      try {
        await handleWaitingRoomAction(socket, roomId, userId, "approved");
      } catch (err) {
        logger.error("Approve user error", { error: err.message });
      }
    });

    socket.on("reject-user", async ({ roomId, userId } = {}) => {
      if (!roomId || !userId) return;
      try {
        await handleWaitingRoomAction(socket, roomId, userId, "rejected");
      } catch (err) {
        logger.error("Reject user error", { error: err.message });
      }
    });

    // ─── LEAVE ROOM ───
    socket.on("leave-room", () => {
      leaveRoom(io, socket);
    });

    // ─── DISCONNECT ───
    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { socketId: socket.id, reason });
      leaveRoom(io, socket);
      chatLimiter.delete(socket.id);
    });
  });
}

function leaveRoom(io, socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const participants = roomParticipants.get(roomId);
  if (participants) {
    participants.delete(socket.id);

    // Notify others
    socket.to(roomId).emit("user-left", {
      socketId: socket.id,
      username: socket.data.username,
    });

    // Clean up empty rooms
    if (participants.size === 0) {
      roomParticipants.delete(roomId);
      logger.info("Room cleaned up (empty)", { roomId });
    }
  }

  socket.leave(roomId);
  socket.data.roomId = null;
}

module.exports = { setupSocket, roomParticipants };
