import AsyncStorage from "@react-native-async-storage/async-storage";

const PROFILE_NAME_KEY = "profile_name";
const PROFILE_AVATAR_KEY = "profile_avatar";

function scopedKey(base: string, userId?: string | null) {
  return userId ? `${base}:${userId}` : base;
}

async function migrateLegacyValue(userId: string, baseKey: string) {
  const legacy = await AsyncStorage.getItem(baseKey);
  if (!legacy) return null;
  const nextKey = scopedKey(baseKey, userId);
  await AsyncStorage.setItem(nextKey, legacy);
  await AsyncStorage.removeItem(baseKey);
  return legacy;
}

export async function getProfileName(userId?: string | null) {
  if (!userId) return null;
  const key = scopedKey(PROFILE_NAME_KEY, userId);
  const stored = await AsyncStorage.getItem(key);
  if (stored) return stored;
  return migrateLegacyValue(userId, PROFILE_NAME_KEY);
}

export async function setProfileName(name: string, userId?: string | null) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(PROFILE_NAME_KEY, userId), name);
}

export async function getProfileAvatar(userId?: string | null) {
  if (!userId) return null;
  const key = scopedKey(PROFILE_AVATAR_KEY, userId);
  const stored = await AsyncStorage.getItem(key);
  if (stored) return stored;
  return migrateLegacyValue(userId, PROFILE_AVATAR_KEY);
}

export async function setProfileAvatar(uri: string, userId?: string | null) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(PROFILE_AVATAR_KEY, userId), uri);
}
