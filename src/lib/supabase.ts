import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface ChatMessageLog {
  id?: number;
  message_id: string;
  sender: string;
  text: string;
  timestamp: number;
  created_at?: string;
}

// Log a chat message to Supabase
export async function logChatMessage(message: ChatMessageLog) {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([
        {
          message_id: message.message_id,
          sender: message.sender,
          text: message.text,
          timestamp: message.timestamp,
        },
      ])
      .select();

    if (error) {
      console.error("Error logging message to Supabase:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to log message:", error);
    return { success: false, error };
  }
}

// Get chat messages from Supabase (optional - for history if needed)
export async function getChatMessages(limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching messages from Supabase:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return { success: false, error, data: [] };
  }
}
