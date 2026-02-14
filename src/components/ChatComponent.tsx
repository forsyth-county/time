"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Realtime } from "ably";
import { ChatClient } from "@ably/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, MessageSquare, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { moderateMessage } from "@/lib/moderate";
import { translateMessage } from "@/lib/translate";
import { logChatMessage } from "@/lib/supabase";
import { LoginForm } from "@/components/LoginForm";

interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isCurrentUser: boolean;
}

export function ChatComponent() {
  const { user, isLoaded, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [translatedMessages, setTranslatedMessages] = useState<Map<string, string>>(new Map());
  const [inputValue, setInputValue] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatClientRef = useRef<ChatClient | null>(null);
  const roomRef = useRef<any>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize Ably Chat
  useEffect(() => {
    if (!isLoaded || !user) return;

    // Hardcoded Ably API key
    const apiKey = "pnOXuA.eA-Lwg:2_EVRGu8j2HGFlHlvbxi48LSWM5JI920L8RaWX_0bHE";

    const initChat = async () => {
      try {
        const realtimeClient = new Realtime({ key: apiKey });
        const chatClient = new ChatClient(realtimeClient);
        chatClientRef.current = chatClient;

        const room = await chatClient.rooms.get("forsyth-time-chat");
        roomRef.current = room;

        // Subscribe to messages
        await room.messages.subscribe((event) => {
          const message = event.message;
          const displayName = message.clientId || "Anonymous";
          const isCurrentUser = message.clientId === user.username;
          
          const timestamp = message.timestamp instanceof Date 
            ? message.timestamp.getTime() 
            : Number(message.timestamp);
          
          const chatMessage: ChatMessage = {
            id: message.serial || Date.now().toString(),
            text: message.text,
            sender: displayName,
            timestamp,
            isCurrentUser,
          };

          setMessages((prev) => [...prev, chatMessage]);

          // Log message to Supabase
          logChatMessage({
            message_id: chatMessage.id,
            sender: displayName,
            text: message.text,
            timestamp,
          }).catch((error) => {
            console.error("Failed to log message to Supabase:", error);
          });

          // Auto-translate message
          translateMessage(message.text, "en").then((translated) => {
            setTranslatedMessages((prev) => new Map(prev).set(chatMessage.id, translated));
          });
        });

        setIsConnected(true);
        toast({
          title: "Connected",
          description: "You're now connected to the chat",
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        toast({
          title: "Connection Failed",
          description: "Could not connect to chat",
          variant: "destructive",
        });
      }
    };

    initChat();

    return () => {
      if (roomRef.current) {
        roomRef.current.messages.unsubscribe();
      }
      // ChatClient cleanup is handled automatically by Ably
    };
  }, [isLoaded, user]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !roomRef.current || !user) return;

    setIsSending(true);
    try {
      // Moderate message
      const { clean, flagged } = moderateMessage(inputValue);
      
      if (flagged) {
        toast({
          title: "Message Filtered",
          description: "Your message contains inappropriate content",
          variant: "destructive",
        });
        setInputValue("");
        setIsSending(false);
        return;
      }

      // Send message to Ably
      await roomRef.current.messages.send({
        text: clean,
      });

      setInputValue("");
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Send Failed",
        description: "Could not send message",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isLoaded) {
    return (
      <Card className="glass border-white/10">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Main Chat Panel */}
      <Card className="glass border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Live Chat
              {isConnected && (
                <span className="ml-2 text-xs text-green-400 font-normal">● Connected</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@{user.username}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-xs"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Messages Container */}
          <div className="h-96 overflow-y-auto space-y-3 p-4 bg-black/20 rounded-lg">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isCurrentUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.isCurrentUser
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {!message.isCurrentUser && (
                      <p className="text-xs font-semibold mb-1 opacity-70">{message.sender}</p>
                    )}
                    <p className="text-sm break-words">{message.text}</p>
                    <p className="text-xs opacity-50 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              disabled={!isConnected || isSending}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || !isConnected || isSending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Translation Panel */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Translated Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 overflow-y-auto space-y-3 p-4 bg-black/20 rounded-lg">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Translations will appear here</p>
              </div>
            ) : (
              messages.map((message) => {
                const translated = translatedMessages.get(message.id) || message.text;
                return (
                  <div key={`translated-${message.id}`} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-blue-400">{message.sender}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <p className="text-sm text-white/90 bg-white/5 rounded p-2">{translated}</p>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
