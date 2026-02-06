import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

const anyConstants = Constants as any;

const extra =
  Constants.expoConfig?.extra ??
  anyConstants.manifest?.extra ??
  anyConstants.manifest2?.extra?.expoClient?.extra ??
  {};

const supabaseUrl = extra.supabaseUrl as string | undefined;
const supabaseAnonKey = extra.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env not loaded. Check mobile/.env and restart: npx expo start -c"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
