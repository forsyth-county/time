"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePeerCall } from "@/hooks/usePeerConnection";
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
    callId,
    status,
    localStream,
    remoteStream,
    error,
    isMuted,
    startCall,
    toggleMute,
    switchCamera,
    disconnect,
  } = usePeerCall();

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
    const localVideo = localVideoRef.current;
    if (localVideo && localStream) {
      console.debug("[Broadcaster] Assigning localStream to <video> — stream id:", localStream.id, "video tracks:", localStream.getVideoTracks().length, "audio tracks:", localStream.getAudioTracks().length);
      localStream.getTracks().forEach((t) => console.debug("[Broadcaster]   local track:", t.kind, "enabled:", t.enabled, "readyState:", t.readyState));
      localVideo.srcObject = localStream;
      localVideo.play().then(() => {
        console.debug("[Broadcaster] ✅ Local video play() succeeded, videoWidth:", localVideo.videoWidth, "videoHeight:", localVideo.videoHeight);
      }).catch((err) => {
        console.error("[Broadcaster] ❌ Local video play() failed:", err);
      });
    } else {
      console.debug("[Broadcaster] localStream effect — videoRef:", !!localVideo, "stream:", !!localStream);
    }
  }, [localStream]);

  useEffect(() => {
    const remoteVideo = remoteVideoRef.current;
    if (remoteVideo && remoteStream) {
      console.debug("[Broadcaster] Assigning remoteStream to <video> — stream id:", remoteStream.id, "video tracks:", remoteStream.getVideoTracks().length, "audio tracks:", remoteStream.getAudioTracks().length);
      remoteStream.getTracks().forEach((t) => console.debug("[Broadcaster]   remote track:", t.kind, "enabled:", t.enabled, "readyState:", t.readyState, "muted:", t.muted));
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play().then(() => {
        console.debug("[Broadcaster] ✅ Remote video play() succeeded, videoWidth:", remoteVideo.videoWidth, "videoHeight:", remoteVideo.videoHeight, "paused:", remoteVideo.paused);
      }).catch((err) => {
        console.error("[Broadcaster] ❌ Remote video play() failed:", err);
      });
    } else {
      console.debug("[Broadcaster] remoteStream effect — videoRef:", !!remoteVideo, "stream:", !!remoteStream);
    }
  }, [remoteStream]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  }, [error]);

  useEffect(() => {
    console.debug("[Broadcaster] Status changed:", status, "| localStream:", !!localStream, "| remoteStream:", !!remoteStream);
    if (status === "connected") {
      toast({ title: "Viewer Connected!", description: "Streaming started", variant: "success" });
    } else if (status === "disconnected") {
      toast({ title: "Disconnected", description: "Stream ended" });
    }
  }, [status]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(callId);
      setCopied(true);
      toast({ title: "Copied!", description: "Call ID copied to clipboard", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the ID manually", variant: "destructive" });
    }
  };

  const handleStartCamera = async () => {
    console.debug("[Broadcaster] handleStartCamera — starting call with callId:", callId);
    triggerHaptic([8, 16, 8]);
    setCameraStarted(true);
    await startCall();
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
              <p className="text-xs text-muted-foreground mb-1">Your Call ID</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-blue-400 break-all">
                {callId}
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
                  <p className="call-title">Forsyth Time</p>
                  <p className="call-subtitle">
                    {remoteStream ? "On call" : "Waiting for the other person"}
                  </p>
                </div>
                <span className="call-badge">
                  {remoteStream ? "Live" : "Preview"}
                </span>
              </div>
              {remoteStream ? (
                <>
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
                </>
              ) : (
                <video
                  key="local-preview"
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-video object-cover rounded-lg video-tile"
                  aria-label="Camera preview"
                />
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
