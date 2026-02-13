"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionState } from "@/components/ConnectionStatus";
import { generatePeerId } from "@/lib/utils";
import { RTC_CONFIG } from "@/lib/peer";
import { getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

// Timeout (ms) for signaling connection before treating as error
const CONNECT_TIMEOUT = 15_000;

const HIGH_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 60, max: 60 },
};

const FALLBACK_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

const MAX_VIDEO_BITRATE = 4_000_000;

const buildVideoConstraints = (
  facingMode: "user" | "environment",
  base: MediaTrackConstraints
): MediaTrackConstraints => ({
  ...base,
  facingMode,
});

const getCameraStream = async (facingMode: "user" | "environment") => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: buildVideoConstraints(facingMode, HIGH_VIDEO_CONSTRAINTS),
      audio: true,
    });
  } catch (err) {
    return await navigator.mediaDevices.getUserMedia({
      video: buildVideoConstraints(facingMode, FALLBACK_VIDEO_CONSTRAINTS),
      audio: true,
    });
  }
};

const configureVideoSender = async (sender: RTCRtpSender, track: MediaStreamTrack) => {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  const frameRate = track.getSettings().frameRate;
  params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE;
  if (frameRate) {
    params.encodings[0].maxFramerate = Math.round(frameRate);
  }
  (params as RTCRtpSendParameters & { degradationPreference?: RTCDegradationPreference }).degradationPreference =
    "maintain-framerate";
  await sender.setParameters(params);
};

interface UsePeerCallReturn {
  callId: string;
  status: ConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  isMuted: boolean;
  facingMode: "user" | "environment";
  isInitiator: boolean;
  startCall: () => Promise<void>;
  joinCall: (roomId: string) => Promise<void>;
  toggleMute: () => void;
  switchCamera: () => void;
  disconnect: () => void;
}

export function usePeerCall(): UsePeerCallReturn {
  const [callId] = useState(() => generatePeerId());
  const [status, setStatus] = useState<ConnectionState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isInitiator, setIsInitiator] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);

  const setupPeerConnection = useCallback((remotePeerId: string) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Add local tracks
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (videoTrack) {
        const sender = pc.addTrack(videoTrack, streamRef.current);
        configureVideoSender(sender, videoTrack).catch((err) => {
          void err;
        });
      }
      if (audioTrack) {
        pc.addTrack(audioTrack, streamRef.current);
      }
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setStatus("streaming");
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", { to: remotePeerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setStatus("streaming");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setStatus("disconnected");
        setRemoteStream(null);
        pc.close();
        if (pcRef.current === pc) pcRef.current = null;
      }
    };

    return pc;
  }, []);

  const startCall = useCallback(async () => {
    setIsInitiator(true);

    // Clean up any previous connection
    pcRef.current?.close();
    pcRef.current = null;
    disconnectSocket(socketRef.current);
    socketRef.current = null;

    try {
      const stream = await getCameraStream(facingMode);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
      }
      streamRef.current = stream;
      setLocalStream(stream);
      setError(null);
      roomIdRef.current = callId;

      // Connect to signaling server
      const socket = getSocket();
      socketRef.current = socket;

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          setStatus("error");
          setError("Signaling server connection timed out. Please try again.");
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        socket.emit("join-room", { roomId: callId });
      });

      socket.on("room-participants", () => {
        setStatus("waiting");
      });

      socket.on("user-joined", async ({ socketId }) => {
        setStatus("connected");
        remotePeerIdRef.current = socketId;
        const pc = setupPeerConnection(socketId);

        // Create and send offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: socketId, offer: pc.localDescription });
        } catch (err) {
          setStatus("error");
          setError("Failed to create WebRTC offer");
        }
      });

      // Handle answer
      socket.on("answer", async ({ from, answer }) => {
        if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            void err;
          }
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async ({ from, candidate }) => {
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            void err;
          }
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        void err;
        setStatus("error");
        setError("Failed to connect to signaling server");
      });

      socket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
        }
      });

      socket.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to access camera";
      setError(message);
      setStatus("error");
    }
  }, [callId, facingMode, setupPeerConnection]);

  const joinCall = useCallback(async (roomId: string) => {
    setIsInitiator(false);
    if (!roomId.trim()) {
      setError("Please enter a valid Call ID");
      return;
    }

    setStatus("connecting");
    setError(null);
    roomIdRef.current = roomId;

    // Clean up any previous connection
    pcRef.current?.close();
    pcRef.current = null;
    disconnectSocket(socketRef.current);
    socketRef.current = null;

    try {
      const stream = await getCameraStream("user");
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
      }
      streamRef.current = stream;
      setLocalStream(stream);

      const socket = getSocket();
      socketRef.current = socket;

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          setStatus("error");
          setError("Signaling server connection timed out.");
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        socket.emit("join-room", { roomId });
      });

      socket.on("room-participants", (participants) => {
        // Filter out ourselves — server includes us in the list
        const others = participants.filter(
          (p: { socketId: string }) => p.socketId !== socket.id
        );
        if (others.length > 0) {
          // There's already someone in the room; they will send us an offer
          // via the "user-joined" event they receive. Just wait.
          setStatus("connecting");
        } else {
          // Nobody else here yet — room doesn't exist or peer left
          setStatus("error");
          setError("No one is on this call. Check the Call ID and try again.");
        }
      });

      // Handle offer from other peer
      socket.on("offer", async ({ from, offer }) => {
        remotePeerIdRef.current = from;
        const pc = setupPeerConnection(from);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { to: from, answer: pc.localDescription });
        } catch (err) {
          setStatus("error");
          setError("Failed to establish WebRTC connection");
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async ({ from, candidate }) => {
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            void err;
          }
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        void err;
        setStatus("error");
        setError("Failed to connect to signaling server");
      });

      socket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
        }
      });

      socket.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setStatus("error");
    }
  }, [setupPeerConnection]);

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
      const stream = await getCameraStream(newFacing);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
      }
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
            configureVideoSender(sender, videoTrack).catch((err) => {
              void err;
            });
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
    disconnectSocket(socketRef.current);
    socketRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("disconnected");
    roomIdRef.current = null;
    remotePeerIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      disconnectSocket(socketRef.current);
    };
  }, []);

  return {
    callId,
    status,
    localStream,
    remoteStream,
    error,
    isMuted,
    facingMode,
    isInitiator,
    startCall,
    joinCall,
    toggleMute,
    switchCamera,
    disconnect,
  };
}
