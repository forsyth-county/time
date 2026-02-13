"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Radio, Loader2 } from "lucide-react";

export type ConnectionState = "idle" | "ready" | "waiting" | "connecting" | "connected" | "streaming" | "disconnected" | "error";

const statusConfig: Record<ConnectionState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; icon: React.ReactNode; pulse?: boolean }> = {
  idle: { label: "Initializing...", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: "Ready", variant: "outline", icon: <Wifi className="h-3 w-3" /> },
  waiting: { label: "Waiting for viewer...", variant: "warning", icon: <Radio className="h-3 w-3 animate-pulse" /> },
  connecting: { label: "Connecting...", variant: "warning", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  connected: { label: "Connected!", variant: "success", icon: <Wifi className="h-3 w-3" />, pulse: true },
  streaming: { label: "Streaming", variant: "success", icon: <Radio className="h-3 w-3" />, pulse: true },
  disconnected: { label: "Disconnected", variant: "destructive", icon: <WifiOff className="h-3 w-3" /> },
  error: { label: "Error", variant: "destructive", icon: <WifiOff className="h-3 w-3" /> },
};

interface ConnectionStatusProps {
  state: ConnectionState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  const config = statusConfig[state];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.8, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <Badge
          variant={config.variant}
          className={`gap-1.5 px-3 py-1 text-xs ${config.pulse ? "connected-pulse" : ""}`}
        >
          {config.icon}
          {config.label}
        </Badge>
      </motion.div>
    </AnimatePresence>
  );
}
