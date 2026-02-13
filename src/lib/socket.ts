// Socket.IO client for WebRTC signaling
// Connects to the Express/Socket.IO server for offer/answer/ICE exchange

import { io, Socket } from "socket.io-client";

const SOCKET_URL = "https://forsythtime.onrender.com";

export function getSocket(): Socket {
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
  });
}

export function disconnectSocket(socket: Socket | null): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
}
