const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

console.log("USING app.config.js, URL=", process.env.EXPO_PUBLIC_SUPABASE_URL);

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...(config.android || {}),
    enableOnBackInvokedCallback: true,
  },
  extra: {
    ...(config.extra || {}),
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
});
