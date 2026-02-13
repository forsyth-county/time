"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionState } from "@/components/ConnectionStatus";
import { generatePeerId } from "@/lib/utils";
import { getRTCConfig, RTC_CONFIG } from "@/lib/peer";
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

  const setupPeerConnection = useCallback(async (remotePeerId: string) => {
    console.debug("[WebRTC] setupPeerConnection called, remotePeerId:", remotePeerId);
    if (pcRef.current) {
      console.debug("[WebRTC] Closing existing PeerConnection before creating new one");
      pcRef.current.close();
    }

    // Fetch fresh TURN credentials from Metered API (falls back to hardcoded if offline)
    let rtcConfig: RTCConfiguration;
    try {
      rtcConfig = await getRTCConfig();
    } catch {
      console.warn("[WebRTC] getRTCConfig() failed, using static RTC_CONFIG fallback");
      rtcConfig = RTC_CONFIG;
    }

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;
    console.debug("[WebRTC] RTCPeerConnection created with", rtcConfig.iceServers?.length, "ICE servers");

    // Add local tracks
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const audioTrack = streamRef.current.getAudioTracks()[0];
      console.debug("[WebRTC] Local stream tracks — video:", videoTrack?.label ?? "NONE", "enabled:", videoTrack?.enabled, "readyState:", videoTrack?.readyState, "| audio:", audioTrack?.label ?? "NONE", "enabled:", audioTrack?.enabled, "readyState:", audioTrack?.readyState);
      if (videoTrack) {
        const sender = pc.addTrack(videoTrack, streamRef.current);
        console.debug("[WebRTC] Added video track to PeerConnection");
        configureVideoSender(sender, videoTrack).catch((err) => {
          console.warn("[WebRTC] configureVideoSender error:", err);
        });
      } else {
        console.warn("[WebRTC] No video track found on local stream!");
      }
      if (audioTrack) {
        pc.addTrack(audioTrack, streamRef.current);
        console.debug("[WebRTC] Added audio track to PeerConnection");
      } else {
        console.warn("[WebRTC] No audio track found on local stream!");
      }
    } else {
      console.warn("[WebRTC] streamRef.current is NULL — no local tracks to add!");
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.debug("[WebRTC] pc.ontrack fired — track kind:", event.track.kind, "readyState:", event.track.readyState, "streams count:", event.streams.length);
      if (event.streams[0]) {
        const rs = event.streams[0];
        console.debug("[WebRTC] Remote stream received — id:", rs.id, "video tracks:", rs.getVideoTracks().length, "audio tracks:", rs.getAudioTracks().length);
        rs.getTracks().forEach((t) => console.debug("[WebRTC]   remote track:", t.kind, "enabled:", t.enabled, "readyState:", t.readyState, "label:", t.label));
        setRemoteStream(rs);
        setStatus("streaming");
      } else {
        console.warn("[WebRTC] pc.ontrack fired but event.streams[0] is empty!");
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        console.debug("[WebRTC] Sending ICE candidate to:", remotePeerId, "type:", e.candidate.type, "protocol:", e.candidate.protocol);
        socketRef.current.emit("ice-candidate", { to: remotePeerId, candidate: e.candidate });
      } else if (!e.candidate) {
        console.debug("[WebRTC] ICE gathering complete (null candidate)");
      }
    };

    pc.onicegatheringstatechange = () => {
      console.debug("[WebRTC] ICE gathering state:", pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      console.debug("[WebRTC] ICE connection state:", pc.iceConnectionState);
    };

    pc.onsignalingstatechange = () => {
      console.debug("[WebRTC] Signaling state:", pc.signalingState);
    };

    pc.onconnectionstatechange = () => {
      console.debug("[WebRTC] Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        console.debug("[WebRTC] ✅ PeerConnection CONNECTED — should be streaming");
        setStatus("streaming");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        console.warn("[WebRTC] ❌ PeerConnection", pc.connectionState);
        setStatus("disconnected");
        setRemoteStream(null);
        pc.close();
        if (pcRef.current === pc) pcRef.current = null;
      }
    };

    return pc;
  }, []);

  const startCall = useCallback(async () => {
    console.debug("[StartCall] startCall() invoked, callId:", callId, "facingMode:", facingMode);
    setIsInitiator(true);

    // Clean up any previous connection
    pcRef.current?.close();
    pcRef.current = null;
    disconnectSocket(socketRef.current);
    socketRef.current = null;

    try {
      console.debug("[StartCall] Requesting camera stream…");
      const stream = await getCameraStream(facingMode);
      console.debug("[StartCall] Camera stream obtained — tracks:", stream.getTracks().map((t) => `${t.kind}:${t.label}:${t.readyState}`));
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
        const settings = videoTrack.getSettings();
        console.debug("[StartCall] Video settings:", JSON.stringify({ width: settings.width, height: settings.height, frameRate: settings.frameRate, facingMode: settings.facingMode }));
      } else {
        console.warn("[StartCall] No video track in camera stream!");
      }
      streamRef.current = stream;
      setLocalStream(stream);
      setError(null);
      roomIdRef.current = callId;

      // Connect to signaling server
      const socket = getSocket();
      socketRef.current = socket;
      console.debug("[StartCall] Connecting to signaling server…");

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          console.error("[StartCall] ❌ Signaling server connection timed out after", CONNECT_TIMEOUT, "ms");
          setStatus("error");
          setError("Signaling server connection timed out. Please try again.");
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        console.debug("[StartCall] ✅ Socket connected, socket.id:", socket.id, "— emitting join-room with roomId:", callId);
        socket.emit("join-room", { roomId: callId });
      });

      socket.on("room-participants", (participants) => {
        console.debug("[StartCall] Received room-participants:", JSON.stringify(participants));
        setStatus("waiting");
      });

      socket.on("user-joined", async ({ socketId }) => {
        console.debug("[StartCall] user-joined event — remote socketId:", socketId);
        setStatus("connected");
        remotePeerIdRef.current = socketId;
        const pc = await setupPeerConnection(socketId);

        // Create and send offer
        try {
          console.debug("[StartCall] Creating WebRTC offer…");
          const offer = await pc.createOffer();
          console.debug("[StartCall] Offer created, type:", offer.type, "SDP length:", offer.sdp?.length);
          await pc.setLocalDescription(offer);
          console.debug("[StartCall] Local description set, signaling state:", pc.signalingState);
          socket.emit("offer", { to: socketId, offer: pc.localDescription });
          console.debug("[StartCall] Offer sent to:", socketId);
        } catch (err) {
          console.error("[StartCall] ❌ Failed to create/send offer:", err);
          setStatus("error");
          setError("Failed to create WebRTC offer");
        }
      });

      // Handle answer
      socket.on("answer", async ({ from, answer }) => {
        console.debug("[StartCall] Received answer from:", from, "signalingState:", pcRef.current?.signalingState);
        if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            console.debug("[StartCall] ✅ Remote description set from answer, signalingState:", pcRef.current.signalingState);
          } catch (err) {
            console.error("[StartCall] ❌ Failed to set remote description from answer:", err);
          }
        } else {
          console.warn("[StartCall] Ignored answer — pcRef.current:", !!pcRef.current, "signalingState:", pcRef.current?.signalingState);
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async ({ from, candidate }) => {
        console.debug("[StartCall] Received ICE candidate from:", from, "candidate:", candidate?.candidate?.slice(0, 60));
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            console.debug("[StartCall] ✅ ICE candidate added");
          } catch (err) {
            console.error("[StartCall] ❌ Failed to add ICE candidate:", err);
          }
        } else {
          console.warn("[StartCall] Ignored ICE candidate — pcRef.current:", !!pcRef.current, "candidate:", !!candidate);
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[StartCall] ❌ Socket connect_error:", err.message);
        setStatus("error");
        setError("Failed to connect to signaling server");
      });

      socket.on("disconnect", (reason) => {
        console.debug("[StartCall] Socket disconnected, reason:", reason);
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
        }
      });

      console.debug("[StartCall] Calling socket.connect()…");
      socket.connect();
    } catch (err) {
      console.error("[StartCall] ❌ startCall error:", err);
      const message = err instanceof Error ? err.message : "Failed to access camera";
      setError(message);
      setStatus("error");
    }
  }, [callId, facingMode, setupPeerConnection]);

  const joinCall = useCallback(async (roomId: string) => {
    console.debug("[JoinCall] joinCall() invoked, roomId:", roomId);
    setIsInitiator(false);
    if (!roomId.trim()) {
      console.warn("[JoinCall] Empty roomId, aborting");
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
      console.debug("[JoinCall] Requesting camera stream (user facing)…");
      const stream = await getCameraStream("user");
      console.debug("[JoinCall] Camera stream obtained — tracks:", stream.getTracks().map((t) => `${t.kind}:${t.label}:${t.readyState}`));
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "motion";
        const settings = videoTrack.getSettings();
        console.debug("[JoinCall] Video settings:", JSON.stringify({ width: settings.width, height: settings.height, frameRate: settings.frameRate }));
      } else {
        console.warn("[JoinCall] No video track in camera stream!");
      }
      streamRef.current = stream;
      setLocalStream(stream);

      const socket = getSocket();
      socketRef.current = socket;
      console.debug("[JoinCall] Connecting to signaling server…");

      const connectTimeout = setTimeout(() => {
        if (!socket.connected) {
          console.error("[JoinCall] ❌ Signaling server connection timed out after", CONNECT_TIMEOUT, "ms");
          setStatus("error");
          setError("Signaling server connection timed out.");
        }
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        console.debug("[JoinCall] ✅ Socket connected, socket.id:", socket.id, "— emitting join-room with roomId:", roomId);
        socket.emit("join-room", { roomId });
      });

      socket.on("room-participants", (participants) => {
        console.debug("[JoinCall] Received room-participants:", JSON.stringify(participants));
        // Filter out ourselves — server includes us in the list
        const others = participants.filter(
          (p: { socketId: string }) => p.socketId !== socket.id
        );
        console.debug("[JoinCall] Other participants in room:", others.length, others.map((p: { socketId: string }) => p.socketId));
        if (others.length > 0) {
          // There's already someone in the room; they will send us an offer
          // via the "user-joined" event they receive. Just wait.
          console.debug("[JoinCall] Waiting for offer from existing participant…");
          setStatus("connecting");
        } else {
          // Nobody else here yet — room doesn't exist or peer left
          console.warn("[JoinCall] No other participants found — room empty or peer left");
          setStatus("error");
          setError("No one is on this call. Check the Call ID and try again.");
        }
      });

      // Handle offer from other peer
      socket.on("offer", async ({ from, offer }) => {
        console.debug("[JoinCall] Received offer from:", from, "type:", offer?.type, "SDP length:", offer?.sdp?.length);
        remotePeerIdRef.current = from;
        const pc = await setupPeerConnection(from);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.debug("[JoinCall] Remote description set from offer, signalingState:", pc.signalingState);
          const answer = await pc.createAnswer();
          console.debug("[JoinCall] Answer created, type:", answer.type, "SDP length:", answer.sdp?.length);
          await pc.setLocalDescription(answer);
          console.debug("[JoinCall] Local description set, signalingState:", pc.signalingState);
          socket.emit("answer", { to: from, answer: pc.localDescription });
          console.debug("[JoinCall] ✅ Answer sent to:", from);
        } catch (err) {
          console.error("[JoinCall] ❌ Failed to handle offer / create answer:", err);
          setStatus("error");
          setError("Failed to establish WebRTC connection");
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async ({ from, candidate }) => {
        console.debug("[JoinCall] Received ICE candidate from:", from, "candidate:", candidate?.candidate?.slice(0, 60));
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            console.debug("[JoinCall] ✅ ICE candidate added");
          } catch (err) {
            console.error("[JoinCall] ❌ Failed to add ICE candidate:", err);
          }
        } else {
          console.warn("[JoinCall] Ignored ICE candidate — pcRef.current:", !!pcRef.current, "candidate:", !!candidate);
        }
      });

      socket.on("connect_error", (err) => {
        clearTimeout(connectTimeout);
        console.error("[JoinCall] ❌ Socket connect_error:", err.message);
        setStatus("error");
        setError("Failed to connect to signaling server");
      });

      socket.on("disconnect", (reason) => {
        console.debug("[JoinCall] Socket disconnected, reason:", reason);
        if (reason !== "io client disconnect") {
          setStatus("disconnected");
        }
      });

      console.debug("[JoinCall] Calling socket.connect()…");
      socket.connect();
    } catch (err) {
      console.error("[JoinCall] ❌ joinCall error:", err);
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
    console.debug("[SwitchCamera] Switching from", facingMode, "to", newFacing);
    setFacingMode(newFacing);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await getCameraStream(newFacing);
      console.debug("[SwitchCamera] New camera stream obtained — tracks:", stream.getTracks().map((t) => `${t.kind}:${t.label}:${t.readyState}`));
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
        console.debug("[SwitchCamera] Replacing tracks in PeerConnection, senders:", senders.length);
        senders.forEach((sender) => {
          if (sender.track?.kind === "video" && videoTrack) {
            sender.replaceTrack(videoTrack);
            console.debug("[SwitchCamera] Replaced video track");
            configureVideoSender(sender, videoTrack).catch((err) => {
              console.warn("[SwitchCamera] configureVideoSender error:", err);
            });
          }
          if (sender.track?.kind === "audio" && audioTrack) {
            sender.replaceTrack(audioTrack);
            console.debug("[SwitchCamera] Replaced audio track");
          }
        });
      } else {
        console.debug("[SwitchCamera] No active PeerConnection, skipping track replacement");
      }
    } catch (err) {
      console.error("[SwitchCamera] ❌ Failed to switch camera:", err);
      const message = err instanceof Error ? err.message : "Failed to switch camera";
      setError(message);
    }
  }, [facingMode]);

  const disconnect = useCallback(() => {
    console.debug("[Disconnect] disconnect() called — closing PeerConnection, stopping tracks, disconnecting socket");
    console.debug("[Disconnect] PeerConnection state before close:", pcRef.current?.connectionState, "signalingState:", pcRef.current?.signalingState);
    pcRef.current?.close();
    pcRef.current = null;
    const trackCount = streamRef.current?.getTracks().length ?? 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    console.debug("[Disconnect] Stopped", trackCount, "local tracks");
    streamRef.current = null;
    disconnectSocket(socketRef.current);
    socketRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("disconnected");
    roomIdRef.current = null;
    remotePeerIdRef.current = null;
    console.debug("[Disconnect] ✅ Cleanup complete");
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
