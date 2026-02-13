"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, Smartphone, Monitor, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";

const steps = [
  {
    icon: <Smartphone className="h-5 w-5 text-blue-400" />,
    title: "Open on your phone",
    description: "Visit this page on your mobile phone. It will default to Broadcaster mode.",
  },
  {
    icon: <ArrowRight className="h-5 w-5 text-blue-400" />,
    title: "Share the ID",
    description: "Copy the generated Peer ID or scan the QR code from your desktop browser.",
  },
  {
    icon: <Monitor className="h-5 w-5 text-blue-400" />,
    title: "Connect from desktop",
    description: "Open this page on your desktop, switch to Viewer mode, paste the ID, and click Connect.",
  },
];

export function InstructionsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Help">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How to use LiveStream</DialogTitle>
          <DialogDescription>
            Stream your phone camera to any desktop browser in real-time using WebRTC.
          </DialogDescription>
        </DialogHeader>
        <Separator className="my-2" />
        <div className="space-y-4">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15, duration: 0.3 }}
              className="flex items-start gap-3"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                {step.icon}
              </div>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <Separator className="my-2" />
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> WebRTC requires HTTPS. When deployed on Vercel, HTTPS is automatic.
          For local development, use <code className="text-blue-400">localhost</code> or an ngrok/tunnel.
        </p>
      </DialogContent>
    </Dialog>
  );
}
