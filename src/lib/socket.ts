// Socket.IO client for WebRTC signaling
// Connects to the Express/Socket.IO server for offer/answer/ICE exchange

import { io, Socket } from "socket.io-client";

const SOCKET_URL = "https://forsythtime.onrender.com";

type SocketTransport = "websocket" | "polling";

const ENV_SOCKET_TRANSPORT = (process.env.NEXT_PUBLIC_SOCKET_TRANSPORT ?? "").toLowerCase();

function getSocketTransports(): SocketTransport[] {
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get("socket");
    if (param === "websocket" || param === "polling") return [param];
  }
  if (ENV_SOCKET_TRANSPORT === "websocket") return ["websocket"];
  if (ENV_SOCKET_TRANSPORT === "polling") return ["polling"];
  return ["websocket", "polling"];
}

export function getSocket(): Socket {
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: getSocketTransports(),
  });
}

export function disconnectSocket(socket: Socket | null): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
}
