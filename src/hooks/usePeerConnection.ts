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

interface UsePeerBroadcasterReturn {
  peerId: string;
  status: ConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await getCameraStream(facingMode);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
      }
      streamRef.current = stream;
      setLocalStream(stream);
      setError(null);

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
        socket.emit("create-broadcast", { broadcastId: peerId });
      });

      socket.on("broadcast-created", () => {
        setStatus("waiting");
      });

      socket.on("viewer-joined", async ({ viewerSocketId }) => {
        setStatus("connected");

        // Tear down previous peer connection if any
        pcRef.current?.close();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // Add local tracks
        if (streamRef.current) {
          const activeStream = streamRef.current;
          const videoTrack = activeStream.getVideoTracks()[0];
          const audioTrack = activeStream.getAudioTracks()[0];
          if (videoTrack) {
            const sender = pc.addTrack(videoTrack, activeStream);
            configureVideoSender(sender, videoTrack).catch((err) => {
              void err;
            });
          }
          if (audioTrack) {
            pc.addTrack(audioTrack, activeStream);
          }
        }

        // ICE candidates → relay to viewer
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("ice-candidate", { to: viewerSocketId, candidate: e.candidate });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setStatus("streaming");
          } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            setStatus("waiting");
            setRemoteStream(null);
            pc.close();
            if (pcRef.current === pc) pcRef.current = null;
          }
        };

        pc.ontrack = (event) => {
          if (event.streams[0]) {
            setRemoteStream(event.streams[0]);
          }
        };

        // Create and send offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: viewerSocketId, offer: pc.localDescription });
        } catch (err) {
          setStatus("error");
          setError("Failed to create WebRTC offer");
        }
      });

      // Handle answer from viewer
      socket.on("answer", async ({ from, answer }) => {
        if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            void err;
          }
        }
      });

      // Handle ICE candidates from viewer
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
    disconnectSocket();
    socketRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      disconnectSocket();
    };
  }, []);

  return {
    peerId,
    status,
    localStream,
    remoteStream,
    error,
    isMuted,
    facingMode,
    startCamera,
    toggleMute,
    switchCamera,
    disconnect,
  };
}

interface UsePeerViewerReturn {
  status: ConnectionState;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  error: string | null;
  isMuted: boolean;
  connect: (remotePeerId: string) => Promise<void>;
  toggleMute: () => void;
  disconnect: () => void;
}

export function usePeerViewer(): UsePeerViewerReturn {
  const [status, setStatus] = useState<ConnectionState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const connectingRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async (remotePeerId: string) => {
    if (!remotePeerId.trim()) {
      setError("Please enter a valid Peer ID");
      return;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      return;
    }
    connectingRef.current = true;

    setStatus("connecting");
    setError(null);

    if (!localStreamRef.current) {
      try {
        const stream = await getCameraStream("user");
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.contentHint = "motion";
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to access camera";
        setError(message);
        setStatus("error");
        connectingRef.current = false;
        return;
      }
    }

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
          setStatus("error");
          setError("Signaling server connection timed out.");
          connectingRef.current = false;
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        socket.emit("join-broadcast", { broadcastId: remotePeerId });
      });

      socket.on("broadcast-not-found", () => {
        setStatus("error");
        setError("Broadcast not found. Check the Peer ID and try again.");
        connectingRef.current = false;
      });

      socket.on("broadcast-joined", ({ broadcasterSocketId }) => {
        void broadcasterSocketId;
        // Peer connection will be created when we receive the offer from the broadcaster
      });

      // Handle offer from broadcaster
      socket.on("offer", async ({ from, offer }) => {
        // Create peer connection
        pcRef.current?.close();
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (videoTrack) {
            pc.addTrack(videoTrack, localStreamRef.current);
          }
          if (audioTrack) {
            pc.addTrack(audioTrack, localStreamRef.current);
          }
        }

        // Collect remote stream
        pc.ontrack = (e) => {
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
          socket.emit("answer", { to: from, answer: pc.localDescription });
        } catch (err) {
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
            void err;
          }
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        void err;
        setStatus("error");
        setError("Failed to connect to signaling server");
        connectingRef.current = false;
      });

      socket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
          connectingRef.current = false;
        }
      });

      socket.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setStatus("error");
      connectingRef.current = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, []);

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
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { status, remoteStream, localStream, error, isMuted, connect, toggleMute, disconnect };
}
