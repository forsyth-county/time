// Client-side moderation utility
import { Filter } from "bad-words";

const filter = new Filter();

export function moderateMessage(message: string): { clean: string; flagged: boolean } {
  try {
    const flagged = filter.isProfane(message);
    const clean = filter.clean(message);
    
    return {
      clean,
      flagged
    };
  } catch (error) {
    console.error("Moderation error:", error);
    return {
      clean: message,
      flagged: false
    };
  }
}
