import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Supabase environment variables are not configured');
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/sb_client/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});