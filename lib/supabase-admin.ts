import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "./env";

export const supabaseAdmin = createClient(
  serverEnv.supabaseUrl(),
  serverEnv.supabaseServiceRoleKey(),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
