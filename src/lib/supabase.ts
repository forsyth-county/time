import { createClient } from "@supabase/supabase-js";

// Hardcoded Supabase credentials
const supabaseUrl = "https://mvnuqandwrnrfhossjdc.supabase.co";
const supabaseKey = "sb_publishable_4fhIXnpB06zOzkGrcoijdg_N8fOGUy9";

// Create Supabase client with auth
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Important for static export
  },
});
