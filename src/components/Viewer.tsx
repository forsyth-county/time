"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePeerCall } from "@/hooks/usePeerConnection";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  Play,
  Mic,
  MicOff,
  Maximize,
  Power,
  MonitorPlay,
  RefreshCw,
} from "lucide-react";

export function Viewer() {
  const {
    status,
    remoteStream,
    localStream,
    error,
    isMuted,
    joinCall,
    toggleMute,
    disconnect,
  } = usePeerCall();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [remotePeerId, setRemotePeerId] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [shakeInput, setShakeInput] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimeoutRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();
  // Derive isConnecting from status instead of using separate state
  const isConnecting = status === "connecting";

  useEffect(() => {
    const remoteVideo = remoteVideoRef.current;
    if (remoteVideo && remoteStream) {
      console.debug("[Viewer] Assigning remoteStream to <video> — stream id:", remoteStream.id, "video tracks:", remoteStream.getVideoTracks().length, "audio tracks:", remoteStream.getAudioTracks().length);
      remoteStream.getTracks().forEach((t) => console.debug("[Viewer]   remote track:", t.kind, "enabled:", t.enabled, "readyState:", t.readyState, "muted:", t.muted));
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play().then(() => {
        console.debug("[Viewer] ✅ Remote video play() succeeded, videoWidth:", remoteVideo.videoWidth, "videoHeight:", remoteVideo.videoHeight, "paused:", remoteVideo.paused);
      }).catch((err) => {
        console.error("[Viewer] ❌ Remote video play() failed:", err);
      });
    } else {
      console.debug("[Viewer] remoteStream effect — videoRef:", !!remoteVideo, "stream:", !!remoteStream);
    }
  }, [remoteStream]);

  useEffect(() => {
    const localVideo = localVideoRef.current;
    if (localVideo && localStream) {
      console.debug("[Viewer] Assigning localStream to <video> — stream id:", localStream.id, "video tracks:", localStream.getVideoTracks().length, "audio tracks:", localStream.getAudioTracks().length);
      localVideo.srcObject = localStream;
      localVideo.play().then(() => {
        console.debug("[Viewer] ✅ Local video play() succeeded");
      }).catch((err) => {
        console.error("[Viewer] ❌ Local video play() failed:", err);
      });
    }
  }, [localStream]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  }, [error]);

  useEffect(() => {
    console.debug("[Viewer] Status changed:", status, "| remoteStream:", !!remoteStream, "| localStream:", !!localStream, "| isStreaming:", status === "streaming" && !!remoteStream);
    if (status === "streaming") {
      toast({ title: "Connected!", description: "Receiving live stream", variant: "success" });
    } else if (status === "disconnected") {
      toast({ title: "Disconnected", description: "Stream ended" });
    }
  }, [status]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConnect = async () => {
    if (!remotePeerId.trim()) {
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
      toast({ title: "Invalid ID", description: "Please enter a Peer ID", variant: "destructive" });
      return;
    }
    console.debug("[Viewer] handleConnect — joining call with remotePeerId:", remotePeerId.trim());
    triggerHaptic([8, 16, 8]);
    await joinCall(remotePeerId.trim());
  };

  const handleReconnect = () => {
    console.debug("[Viewer] handleReconnect — disconnecting then re-joining with:", remotePeerId.trim());
    triggerHaptic([6, 10, 6]);
    disconnect();
    setTimeout(() => joinCall(remotePeerId.trim()), 500);
  };

  const handleFullscreen = () => {
    if (remoteVideoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        remoteVideoRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const resetIdle = () => {
    setIsIdle(false);
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = window.setTimeout(() => setIsIdle(true), 10000);
  };

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (pasted) {
      setRemotePeerId(pasted);
    }
  };

  const isStreaming = status === "streaming" && remoteStream;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4 }}
      className="space-y-4"
    >
      {/* Status */}
      <div className="flex justify-center">
        <ConnectionStatus state={status === "idle" ? "ready" : status} />
      </div>

      {/* Connect Card */}
      {!isStreaming && (
        <Card className="glass border-white/10 accent-border">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="peer-id-input">Call ID</Label>
              <motion.div
                animate={shakeInput ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <Input
                  ref={inputRef}
                  id="peer-id-input"
                  placeholder="Enter Call ID from your friend"
                  value={remotePeerId}
                  onChange={(e) => setRemotePeerId(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="font-mono text-center text-lg h-12 bg-white/5"
                  aria-label="Enter call ID"
                  autoComplete="off"
                />
              </motion.div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || !remotePeerId.trim()}
              className="w-full h-12 text-base gap-2"
              size="lg"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Join Call
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connecting skeleton */}
      <AnimatePresence>
        {isConnecting && status === "connecting" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="glass border-white/10 accent-border">
              <CardContent className="p-4">
                <Skeleton className="w-full aspect-video rounded-lg" />
                <div className="mt-3 flex justify-center">
                  <Skeleton className="h-4 w-32" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remote Video */}
      <AnimatePresence>
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="glass border-white/10 overflow-hidden accent-border">
              <CardContent className="p-0 relative video-stage call-shell">
                <div
                  className="relative"
                  onMouseEnter={() => setShowControls(true)}
                  onMouseLeave={() => setShowControls(false)}
                  onTouchStart={() => {
                    resetIdle();
                    setShowControls((prev) => !prev);
                  }}
                  onMouseMove={resetIdle}
                >
                  <div className="call-header">
                    <div>
                      <p className="call-title">Forsyth Time</p>
                      <p className="call-subtitle">
                        {remotePeerId ? `Call ID ${remotePeerId.slice(0, 4)}…${remotePeerId.slice(-4)}` : "Connecting"}
                      </p>
                    </div>
                    <span className="call-badge">Live</span>
                  </div>
                  <video
                    key="remote"
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full aspect-video object-cover rounded-lg video-tile"
                    aria-label="Remote stream"
                  />
                  {localStream && (
                    <div className="pip-shell">
                      <video
                        key="local-pip"
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="pip-video"
                        aria-label="Your camera"
                      />
                    </div>
                  )}

                  {/* Controls Overlay */}
                  <AnimatePresence>
                    {showControls && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`call-controls ${isIdle ? "controls-idle" : ""}`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              triggerHaptic(8);
                              toggleMute();
                            }}
                            className="call-control-btn"
                            aria-label={isMuted ? "Unmute" : "Mute"}
                          >
                            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              triggerHaptic(6);
                              handleFullscreen();
                            }}
                            className="call-control-btn"
                            aria-label="Fullscreen"
                          >
                            <Maximize className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleReconnect}
                            className="call-control-btn"
                            aria-label="Reconnect"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              triggerHaptic([12, 20, 12]);
                              disconnect();
                            }}
                            className="call-control-btn call-control-btn-danger"
                            aria-label="Disconnect"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disconnected / No stream placeholder */}
      {!isStreaming && !isConnecting && status === "disconnected" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="glass border-white/10">
            <CardContent className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[200px]">
              <MonitorPlay className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Stream ended. Enter a Peer ID to reconnect.
              </p>
              <Button onClick={handleReconnect} variant="outline" size="sm" className="gap-2" disabled={!remotePeerId.trim()}>
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Error state with retry */}
      {status === "error" && (
        <Card className="glass border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-red-400 mb-3">{error || "Connection failed"}</p>
            <Button onClick={handleReconnect} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
