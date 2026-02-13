"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionState } from "@/components/ConnectionStatus";
import { generatePeerId } from "@/lib/utils";

// PeerJS is loaded dynamically because it accesses browser APIs
// HTTPS note: WebRTC requires secure contexts. Vercel deploys are HTTPS by default.
// For local dev, use localhost or an ngrok/cloudflare tunnel.

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

  const peerRef = useRef<import("peerjs").default | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<import("peerjs").MediaConnection | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setError(null);

      // Import PeerJS dynamically
      const { default: Peer } = await import("peerjs");
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on("open", () => {
        setStatus("waiting");
      });

      peer.on("call", (call) => {
        setStatus("connected");
        callRef.current = call;
        call.answer(stream);

        call.on("stream", () => {
          setStatus("streaming");
        });

        call.on("close", () => {
          setStatus("waiting");
          callRef.current = null;
        });

        call.on("error", () => {
          setStatus("error");
          setError("Call error occurred");
        });
      });

      peer.on("error", (err) => {
        setStatus("error");
        setError(err.message || "PeerJS error");
      });

      peer.on("disconnected", () => {
        setStatus("disconnected");
      });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setLocalStream(stream);

      // Replace tracks in active call
      if (callRef.current) {
        const senders = callRef.current.peerConnection?.getSenders();
        if (senders) {
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to switch camera";
      setError(message);
    }
  }, [facingMode]);

  const disconnect = useCallback(() => {
    callRef.current?.close();
    callRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    setLocalStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      callRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.destroy();
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

  const peerRef = useRef<import("peerjs").default | null>(null);
  const callRef = useRef<import("peerjs").MediaConnection | null>(null);
  const retryCountRef = useRef(0);

  const connect = useCallback(async (remotePeerId: string) => {
    if (!remotePeerId.trim()) {
      setError("Please enter a valid Peer ID");
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      const { default: Peer } = await import("peerjs");

      // Cleanup previous connection
      peerRef.current?.destroy();

      const peer = new Peer();
      peerRef.current = peer;

      peer.on("open", () => {
        // Create a silent stream to initiate the call (viewer doesn't need to send media)
        const silentStream = new MediaStream();
        const call = peer.call(remotePeerId, silentStream);
        callRef.current = call;

        if (!call) {
          setStatus("error");
          setError("Failed to initiate call. Check the Peer ID.");
          return;
        }

        call.on("stream", (stream) => {
          setRemoteStream(stream);
          setStatus("streaming");
          retryCountRef.current = 0;
        });

        call.on("close", () => {
          setStatus("disconnected");
          setRemoteStream(null);
        });

        call.on("error", (err) => {
          setStatus("error");
          setError(err.message || "Call failed");
        });
      });

      peer.on("error", (err) => {
        setStatus("error");
        setError(err.message || "Connection failed");
        retryCountRef.current++;
      });

      peer.on("disconnected", () => {
        setStatus("disconnected");
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setStatus("error");
      retryCountRef.current++;
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
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    setRemoteStream(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      callRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  return { status, remoteStream, error, isMuted, connect, toggleMute, disconnect };
}
