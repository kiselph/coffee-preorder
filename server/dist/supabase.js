import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env");
}
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
});
