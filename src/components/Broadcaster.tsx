"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePeerBroadcaster } from "@/hooks/usePeerConnection";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Copy,
  Check,
  Mic,
  MicOff,
  SwitchCamera,
  Maximize,
  Power,
  Video,
  Camera,
} from "lucide-react";

export function Broadcaster() {
  const {
    peerId,
    status,
    localStream,
    remoteStream,
    error,
    isMuted,
    startCamera,
    toggleMute,
    switchCamera,
    disconnect,
  } = usePeerBroadcaster();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimeoutRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  }, [error]);

  useEffect(() => {
    if (status === "connected") {
      toast({ title: "Viewer Connected!", description: "Streaming started", variant: "success" });
    } else if (status === "disconnected") {
      toast({ title: "Disconnected", description: "Stream ended" });
    }
  }, [status]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(peerId);
      setCopied(true);
      toast({ title: "Copied!", description: "Peer ID copied to clipboard", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the ID manually", variant: "destructive" });
    }
  };

  const handleStartCamera = async () => {
    triggerHaptic([8, 16, 8]);
    setCameraStarted(true);
    await startCamera();
  };

  const handleFullscreen = () => {
    const target = remoteStream ? remoteVideoRef.current : localVideoRef.current;
    if (target) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        target.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleDisconnect = () => {
    triggerHaptic([12, 20, 12]);
    disconnect();
    setCameraStarted(false);
    setDisconnectOpen(false);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4 }}
      className="space-y-4"
    >
      {/* Status */}
      <div className="flex justify-center">
        <ConnectionStatus state={cameraStarted ? status : "idle"} />
      </div>

      {/* Peer ID Card */}
      <Card className="glass border-white/10 accent-border">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs text-muted-foreground mb-1">Your Peer ID</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-blue-400 break-all">
                {peerId}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5"
                aria-label="Copy Peer ID"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Check className="h-4 w-4 text-green-400" />
                    </motion.div>
                  ) : (
                    <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Copy className="h-4 w-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Camera Preview */}
      {!cameraStarted ? (
        <Card className="glass border-white/10 accent-border">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[200px]">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Start a call to share your camera
            </p>
            <Button onClick={handleStartCamera} className="gap-2" size="lg">
              <Video className="h-4 w-4" />
              Start Call
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass border-white/10 overflow-hidden accent-border">
          <CardContent className="p-0 relative video-stage call-shell">
            <div
              className="relative"
              onMouseEnter={() => setShowControls(true)}
              onMouseLeave={() => setShowControls(false)}
              onTouchStart={(event) => {
                resetIdle();
                setShowControls((prev) => !prev);
              }}
              onMouseMove={resetIdle}
            >
              <div className="call-header">
                <div>
                  <p className="call-title">Chromebook Call</p>
                  <p className="call-subtitle">
                    {remoteStream ? "On call" : "Waiting for the other person"}
                  </p>
                </div>
                <span className="call-badge">
                  {remoteStream ? "Live" : "Preview"}
                </span>
              </div>
              <video
                ref={remoteStream ? remoteVideoRef : localVideoRef}
                autoPlay
                playsInline
                muted={!remoteStream}
                className="w-full aspect-video object-cover rounded-lg video-tile"
                aria-label={remoteStream ? "Remote stream" : "Camera preview"}
              />
              {remoteStream && localStream && (
                <div className="pip-shell">
                  <video
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
                        onClick={switchCamera}
                        className="call-control-btn"
                        aria-label="Switch camera"
                      >
                        <SwitchCamera className="h-4 w-4" />
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
                      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="call-control-btn call-control-btn-danger"
                            aria-label="Disconnect"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Disconnect?</DialogTitle>
                            <DialogDescription>
                              This will stop the camera and end any active streams.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setDisconnectOpen(false)}>
                              Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleDisconnect}>
                              Disconnect
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error retry for camera permission */}
      {error && error.includes("Permission") && (
        <Card className="glass border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-red-400 mb-3">Camera permission denied</p>
            <p className="text-xs text-muted-foreground mb-3">
              Please allow camera access in your browser settings and try again.
            </p>
            <Button onClick={handleStartCamera} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
