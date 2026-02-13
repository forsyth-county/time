const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// PeerJS server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// Socket.io server
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// Mount PeerJS server
app.use('/peerjs', peerServer);

// In-memory room state: roomId -> { broadcaster: socketId, viewer: socketId }
const rooms = new Map();

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Signaling server is running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: rooms.size });
});

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("join-room", ({ roomId, role, peerId } = {}) => {
    if (!roomId || !role) {
      socket.emit("error-message", { message: "roomId and role are required" });
      return;
    }

    if (typeof roomId !== "string" || roomId.length > 128) {
      socket.emit("error-message", { message: "roomId must be a string of 128 characters or fewer" });
      return;
    }

    if (role !== "broadcaster" && role !== "viewer") {
      socket.emit("error-message", {
        message: "role must be 'broadcaster' or 'viewer'",
      });
      return;
    }

    // Leave any previously joined room
    if (socket.data.roomId) {
      leaveRoom(socket);
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;
    socket.data.peerId = peerId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {});
    }

    const room = rooms.get(roomId);

    if (role === "broadcaster") {
      if (room.broadcaster) {
        socket.emit("error-message", { message: "Room already has a broadcaster" });
        socket.leave(roomId);
        socket.data.roomId = null;
        socket.data.role = null;
        socket.data.peerId = null;
        return;
      }
      room.broadcaster = socket.id;
      console.log(`[join-room] broadcaster ${socket.id} joined room ${roomId}`);

      // If a viewer is already waiting, notify both
      if (room.viewer) {
        const viewerSocket = io.sockets.sockets.get(room.viewer);
        if (viewerSocket) {
          socket.emit("viewer-joined", {
            viewerId: room.viewer,
            peerId: viewerSocket.data.peerId,
          });
          viewerSocket.emit("broadcaster-ready", {
            broadcasterId: socket.id,
            peerId: socket.data.peerId,
          });
        }
      }
    } else {
      if (room.viewer) {
        socket.emit("error-message", { message: "Room already has a viewer" });
        socket.leave(roomId);
        socket.data.roomId = null;
        socket.data.role = null;
        socket.data.peerId = null;
        return;
      }
      room.viewer = socket.id;
      console.log(`[join-room] viewer ${socket.id} joined room ${roomId}`);

      // If a broadcaster is already present, notify both
      if (room.broadcaster) {
        const broadcasterSocket = io.sockets.sockets.get(room.broadcaster);
        if (broadcasterSocket) {
          broadcasterSocket.emit("viewer-joined", {
            viewerId: socket.id,
            peerId: socket.data.peerId,
          });
          socket.emit("broadcaster-ready", {
            broadcasterId: room.broadcaster,
            peerId: broadcasterSocket.data.peerId,
          });
        }
      }
    }
  });

  // Relay WebRTC signaling events to the other peer in the room
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

  socket.on("offer", (data) => {
    if (!isValidPayload(data)) return;
    const targetId = getPeerId(socket);
    if (targetId) {
      io.to(targetId).emit("offer", data);
      console.log(`[offer] ${socket.id} -> ${targetId}`);
    }
  });

  socket.on("answer", (data) => {
    if (!isValidPayload(data)) return;
    const targetId = getPeerId(socket);
    if (targetId) {
      io.to(targetId).emit("answer", data);
      console.log(`[answer] ${socket.id} -> ${targetId}`);
    }
  });

  socket.on("ice-candidate", (data) => {
    if (!isValidPayload(data)) return;
    const targetId = getPeerId(socket);
    if (targetId) {
      io.to(targetId).emit("ice-candidate", data);
      console.log(`[ice-candidate] ${socket.id} -> ${targetId}`);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
    leaveRoom(socket);
  });
});

/**
 * Get the other peer's socket ID in the same room.
 */
function getPeerId(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return null;

  const room = rooms.get(roomId);
  if (!room) return null;

  if (socket.data.role === "broadcaster") {
    return room.viewer || null;
  }
  return room.broadcaster || null;
}

/**
 * Remove a socket from its room and notify the other peer.
 */
function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  const role = socket.data.role;
  const otherPeerId = getPeerId(socket);

  // Clean up room state
  if (role === "broadcaster") {
    delete room.broadcaster;
  } else if (role === "viewer") {
    delete room.viewer;
  }

  // Remove empty rooms
  if (!room.broadcaster && !room.viewer) {
    rooms.delete(roomId);
    console.log(`[room-cleanup] room ${roomId} removed`);
  }

  // Notify the other peer
  if (otherPeerId) {
    io.to(otherPeerId).emit("peer-disconnected", {
      peerId: socket.id,
      role: role,
    });
    console.log(`[peer-disconnected] notified ${otherPeerId} about ${socket.id}`);
  }

  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.role = null;
  socket.data.peerId = null;
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
