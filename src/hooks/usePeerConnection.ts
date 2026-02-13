"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionState } from "@/components/ConnectionStatus";
import { generatePeerId } from "@/lib/utils";
import { RTC_CONFIG } from "@/lib/peer";
import { getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

// Timeout (ms) for signaling connection before treating as error
const CONNECT_TIMEOUT = 15_000;

interface UsePeerBroadcasterReturn {
  peerId: string;
  status: ConnectionState;
  localStream: MediaStream | null;
  error: string | null;
  isMuted: boolean;
  facingMode: "user" | "environment";
  startCamera: () => Promise<void>;
  toggleMute: () => void;
  switchCamera: () => void;
  disconnect: () => void;
}

export function usePeerBroadcaster(): UsePeerBroadcasterReturn {
  const [peerId] = useState(() => generatePeerId());
  const [status, setStatus] = useState<ConnectionState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    console.log("[DEBUG] Starting camera with facing mode:", facingMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setError(null);
      console.log("[DEBUG] Camera stream obtained");

      // Connect to signaling server
      const socket = getSocket();
      socketRef.current = socket;

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          console.error("[DEBUG] Socket connect timed out");
          setStatus("error");
          setError("Signaling server connection timed out. Please try again.");
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        console.log("[DEBUG] Socket connected, registering broadcast:", peerId);
        socket.emit("create-broadcast", { broadcastId: peerId });
      });

      socket.on("broadcast-created", () => {
        console.log("[DEBUG] Broadcast registered:", peerId);
        setStatus("waiting");
      });

      socket.on("viewer-joined", async ({ viewerSocketId }) => {
        console.log("[DEBUG] Viewer joined:", viewerSocketId);
        setStatus("connected");

        // Tear down previous peer connection if any
        pcRef.current?.close();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // Add local tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, streamRef.current!);
          });
        }

        // ICE candidates → relay to viewer
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("ice-candidate", { to: viewerSocketId, candidate: e.candidate });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("[DEBUG] Broadcaster PC state:", pc.connectionState);
          if (pc.connectionState === "connected") {
            setStatus("streaming");
          } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            setStatus("waiting");
            pc.close();
            if (pcRef.current === pc) pcRef.current = null;
          }
        };

        // Create and send offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log("[DEBUG] Sending offer to viewer:", viewerSocketId);
          socket.emit("offer", { to: viewerSocketId, offer: pc.localDescription });
        } catch (err) {
          console.error("[DEBUG] Failed to create offer:", err);
          setStatus("error");
          setError("Failed to create WebRTC offer");
        }
      });

      // Handle answer from viewer
      socket.on("answer", async ({ from, answer }) => {
        console.log("[DEBUG] Received answer from:", from);
        if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            console.error("[DEBUG] Failed to set remote description:", err);
          }
        }
      });

      // Handle ICE candidates from viewer
      socket.on("ice-candidate", async ({ from, candidate }) => {
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[DEBUG] Failed to add ICE candidate:", err);
          }
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[DEBUG] Socket connect error:", err);
        setStatus("error");
        setError("Failed to connect to signaling server");
      });

      socket.on("disconnect", (reason) => {
        console.log("[DEBUG] Socket disconnected:", reason);
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
        }
      });

      socket.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to access camera";
      console.error("[DEBUG] Camera/start error:", err);
      setError(message);
      setStatus("error");
    }
  }, [peerId, facingMode]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, []);

  const switchCamera = useCallback(async () => {
    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setLocalStream(stream);

      // Replace tracks in active peer connection
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        senders.forEach((sender) => {
          if (sender.track?.kind === "video" && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
          if (sender.track?.kind === "audio" && audioTrack) {
            sender.replaceTrack(audioTrack);
          }
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to switch camera";
      setError(message);
    }
  }, [facingMode]);

  const disconnect = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    disconnectSocket();
    socketRef.current = null;
    setLocalStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      disconnectSocket();
    };
  }, []);

  return { peerId, status, localStream, error, isMuted, facingMode, startCamera, toggleMute, switchCamera, disconnect };
}

interface UsePeerViewerReturn {
  status: ConnectionState;
  remoteStream: MediaStream | null;
  error: string | null;
  isMuted: boolean;
  connect: (remotePeerId: string) => Promise<void>;
  toggleMute: () => void;
  disconnect: () => void;
}

export function usePeerViewer(): UsePeerViewerReturn {
  const [status, setStatus] = useState<ConnectionState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const connectingRef = useRef(false);

  const connect = useCallback(async (remotePeerId: string) => {
    console.log("[DEBUG] Viewer attempting to connect to:", remotePeerId);
    if (!remotePeerId.trim()) {
      setError("Please enter a valid Peer ID");
      return;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      console.log("[DEBUG] Connection already in progress, ignoring");
      return;
    }
    connectingRef.current = true;

    setStatus("connecting");
    setError(null);

    // Clean up previous connection
    pcRef.current?.close();
    pcRef.current = null;
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      const socket = getSocket();
      socketRef.current = socket;

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          console.error("[DEBUG] Viewer socket connect timed out");
          setStatus("error");
          setError("Signaling server connection timed out.");
          connectingRef.current = false;
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        console.log("[DEBUG] Viewer socket connected, joining broadcast:", remotePeerId);
        socket.emit("join-broadcast", { broadcastId: remotePeerId });
      });

      socket.on("broadcast-not-found", () => {
        console.log("[DEBUG] Broadcast not found:", remotePeerId);
        setStatus("error");
        setError("Broadcast not found. Check the Peer ID and try again.");
        connectingRef.current = false;
      });

      socket.on("broadcast-joined", ({ broadcasterSocketId }) => {
        console.log("[DEBUG] Joined broadcast, broadcaster socket:", broadcasterSocketId);
        // Peer connection will be created when we receive the offer from the broadcaster
      });

      // Handle offer from broadcaster
      socket.on("offer", async ({ from, offer }) => {
        console.log("[DEBUG] Received offer from broadcaster:", from);

        // Create peer connection
        pcRef.current?.close();
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // Collect remote stream
        pc.ontrack = (e) => {
          console.log("[DEBUG] Received remote track:", e.track.kind);
          if (e.streams[0]) {
            setRemoteStream(e.streams[0]);
            setStatus("streaming");
            connectingRef.current = false;
          }
        };

        // ICE candidates → relay to broadcaster
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("ice-candidate", { to: from, candidate: e.candidate });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("[DEBUG] Viewer PC state:", pc.connectionState);
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            setStatus("disconnected");
            setRemoteStream(null);
            pc.close();
            if (pcRef.current === pc) pcRef.current = null;
            connectingRef.current = false;
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[DEBUG] Sending answer to broadcaster:", from);
          socket.emit("answer", { to: from, answer: pc.localDescription });
        } catch (err) {
          console.error("[DEBUG] Failed to handle offer:", err);
          setStatus("error");
          setError("Failed to establish WebRTC connection");
          connectingRef.current = false;
        }
      });

      // Handle ICE candidates from broadcaster
      socket.on("ice-candidate", async ({ from, candidate }) => {
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[DEBUG] Failed to add ICE candidate:", err);
          }
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[DEBUG] Viewer socket error:", err);
        setStatus("error");
        setError("Failed to connect to signaling server");
        connectingRef.current = false;
      });

      socket.on("disconnect", (reason) => {
        console.log("[DEBUG] Viewer socket disconnected:", reason);
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
          connectingRef.current = false;
        }
      });

      socket.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      console.error("[DEBUG] Viewer connection error:", err);
      setError(message);
      setStatus("error");
      connectingRef.current = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (remoteStream) {
      const audioTracks = remoteStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, [remoteStream]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    pcRef.current?.close();
    pcRef.current = null;
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRemoteStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
    };
  }, []);

  return { status, remoteStream, error, isMuted, connect, toggleMute, disconnect };
}
