"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { GridBackground } from "@/components/GridBackground";
import { Broadcaster } from "@/components/Broadcaster";
import { Viewer } from "@/components/Viewer";
import { InstructionsDialog } from "@/components/InstructionsDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, Smartphone, Monitor } from "lucide-react";
import { isMobileDevice } from "@/lib/utils";

export default function Home() {
  const [isClientMounted, setIsClientMounted] = useState(false);

  const defaultTab = useMemo(() => {
    if (typeof window === "undefined") return "viewer";
    return isMobileDevice() ? "broadcaster" : "viewer";
  }, []);

  // Use a ref-callback to detect mount without triggering a re-render via useEffect+setState
  const mountRef = (node: HTMLElement | null) => {
    if (node && !isClientMounted) setIsClientMounted(true);
  };

  if (!isClientMounted) {
    // Render a hidden div just to trigger mountRef
    return <div ref={mountRef} />;
  }

  return (
    <>
      <GridBackground />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="min-h-screen flex items-start justify-center px-4 py-6 sm:py-12"
      >
        <div className="w-full max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-center mb-6 sm:mb-8"
          >
            <div className="flex items-center justify-center gap-3 mb-2">
              <Radio className="h-8 w-8 text-blue-400 glow-icon" />
              <h1 className="text-3xl sm:text-4xl font-bold glow-text">
                LiveStream
              </h1>
              <div className="ml-auto absolute right-4 top-4 sm:right-8 sm:top-8">
                <InstructionsDialog />
              </div>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              Real-time phone to desktop streaming
            </p>
          </motion.div>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="glass rounded-2xl p-4 sm:p-6"
          >
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="broadcaster" className="gap-2">
                  <Smartphone className="h-4 w-4" />
                  Broadcaster
                </TabsTrigger>
                <TabsTrigger value="viewer" className="gap-2">
                  <Monitor className="h-4 w-4" />
                  Viewer
                </TabsTrigger>
              </TabsList>

              <TabsContent value="broadcaster">
                <Broadcaster />
              </TabsContent>
              <TabsContent value="viewer">
                <Viewer />
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-xs text-muted-foreground mt-6"
          >
            Powered by WebRTC &amp; PeerJS • No server required
          </motion.p>
        </div>
      </motion.main>
    </>
  );
}

