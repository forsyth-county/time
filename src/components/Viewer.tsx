"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePeerViewer } from "@/hooks/usePeerConnection";
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
    error,
    isMuted,
    connect,
    toggleMute,
    disconnect,
  } = usePeerViewer();

  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [remotePeerId, setRemotePeerId] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [shakeInput, setShakeInput] = useState(false);
  // Derive isConnecting from status instead of using separate state
  const isConnecting = status === "connecting";

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  }, [error]);

  useEffect(() => {
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
    await connect(remotePeerId.trim());
  };

  const handleReconnect = () => {
    disconnect();
    setTimeout(() => connect(remotePeerId.trim()), 500);
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted) {
      setRemotePeerId(pasted.trim());
    }
  };

  const isStreaming = status === "streaming" && remoteStream;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Status */}
      <div className="flex justify-center">
        <ConnectionStatus state={status === "idle" ? "ready" : status} />
      </div>

      {/* Connect Card */}
      {!isStreaming && (
        <Card className="glass border-white/10">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="peer-id-input">Broadcaster Peer ID</Label>
              <motion.div
                animate={shakeInput ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <Input
                  ref={inputRef}
                  id="peer-id-input"
                  placeholder="Enter Peer ID from broadcaster"
                  value={remotePeerId}
                  onChange={(e) => setRemotePeerId(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="font-mono text-center text-lg h-12 bg-white/5"
                  aria-label="Enter broadcaster Peer ID"
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
                  Connect
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
            <Card className="glass border-white/10">
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
            <Card className="glass border-white/10 overflow-hidden">
              <CardContent className="p-0 relative">
                <div
                  className="relative"
                  onMouseEnter={() => setShowControls(true)}
                  onMouseLeave={() => setShowControls(false)}
                  onTouchStart={() => setShowControls((prev) => !prev)}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full aspect-video object-cover rounded-lg"
                    aria-label="Remote stream"
                  />

                  {/* Controls Overlay */}
                  <AnimatePresence>
                    {showControls && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20"
                            aria-label={isMuted ? "Unmute" : "Mute"}
                          >
                            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleFullscreen}
                            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20"
                            aria-label="Fullscreen"
                          >
                            <Maximize className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleReconnect}
                            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20"
                            aria-label="Reconnect"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={disconnect}
                            className="h-10 w-10 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400"
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
