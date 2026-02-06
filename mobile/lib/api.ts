import Constants from "expo-constants";

const anyConstants = Constants as any;

const extra =
  Constants.expoConfig?.extra ??
  anyConstants.manifest?.extra ??
  anyConstants.manifest2?.extra?.expoClient?.extra ??
  {};

const apiUrl = extra.apiUrl as string | undefined;

if (!apiUrl) {
  throw new Error(
    "API URL not loaded. Check mobile/.env and restart: npx expo start -c"
  );
}

export const API_URL = apiUrl.replace(/\/$/, "");
