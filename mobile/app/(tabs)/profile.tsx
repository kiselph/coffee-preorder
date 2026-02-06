import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { clearAuthToken, getAuthUser } from "../../lib/auth";
import * as ImagePicker from "expo-image-picker";
import { getProfileAvatar, getProfileName, setProfileAvatar, setProfileName } from "../../lib/profile";

const LANGUAGE_KEY = "profile_language";
const CURRENCY_KEY = "profile_currency";

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [name, setName] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [currency, setCurrency] = useState("USD");
  const insets = useSafeAreaInsets();
  const palette = {
    lightBackground: "#F4EEE8",
    cardLight: "#FFFFFF",
    cardDark: "#13202C",
    mutedLight: "#7D7D7D",
    mutedDark: "rgba(255,255,255,0.7)",
    accent: "#F0842F",
  };
  const cardBackground = colorScheme === "dark" ? palette.cardDark : palette.cardLight;
  const muted = colorScheme === "dark" ? palette.mutedDark : palette.mutedLight;

  const loadProfile = useCallback(async () => {
    const user = await getAuthUser();
    const id = user?.id ?? null;
    setUserId(id);
    setEmail(user?.email ?? null);
    if (!id) {
      setName("");
      setAvatarUri(null);
      return;
    }
    const storedName = await getProfileName(id);
    const storedAvatar = await getProfileAvatar(id);
    setName(storedName ?? "");
    setAvatarUri(storedAvatar ?? null);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const loadPrefs = async () => {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const savedCurrency = await AsyncStorage.getItem(CURRENCY_KEY);
      if (savedLanguage) setLanguage(savedLanguage);
      if (savedCurrency) setCurrency(savedCurrency);
    };
    loadPrefs();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    AsyncStorage.setItem(CURRENCY_KEY, currency);
  }, [currency]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function handleLogout() {
    await clearAuthToken();
    setName("");
    setAvatarUri(null);
    setUserId(null);
    Alert.alert("Signed out", "You have been logged out.");
  }


  const initials = useMemo(() => {
    if (!name) return "U";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }, [name]);

  async function handleAvatarPress(setAvatar?: (uri: string) => void) {
    if (!userId) {
      Alert.alert("Sign in first", "Log in to update your profile.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to change avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const dataUrl = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : uri;
      if (setAvatar) {
        setAvatar(dataUrl);
      } else {
        setAvatarUri(dataUrl);
        await setProfileAvatar(dataUrl, userId);
      }
    }
  }

  function openEditProfile() {
    setDraftName(name);
    setDraftAvatar(avatarUri);
    setEditOpen(true);
  }

  async function handleSaveProfile() {
    if (!userId) {
      Alert.alert("Sign in first", "Log in to update your profile.");
      return;
    }
    setName(draftName.trim());
    setAvatarUri(draftAvatar ?? null);
    await setProfileName(draftName.trim(), userId);
    if (draftAvatar) {
      await setProfileAvatar(draftAvatar, userId);
    }
    setEditOpen(false);
  }

  const cycleOption = useCallback((options: string[], value: string) => {
    const index = options.indexOf(value);
    return options[(index + 1) % options.length];
  }, []);

  const languageOptions = ["English", "Русский", "Español"];
  const currencyOptions = ["USD", "EUR", "RUB"];

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingTop: Math.max(insets.top + 12, 24),
        gap: 16,
        backgroundColor: colorScheme === "dark" ? colors.background : palette.lightBackground,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text }}>
        Profile
      </Text>

      <View
        style={{
          backgroundColor: cardBackground,
          borderRadius: 20,
          padding: 20,
          gap: 12,
          shadowColor: "#000",
          shadowOpacity: colorScheme === "dark" ? 0 : 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Pressable
          onPress={openEditProfile}
          style={{ alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: palette.accent, fontWeight: "600" }}>Edit Profile</Text>
        </Pressable>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: "rgba(0,0,0,0.1)",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88 }} />
            ) : (
              <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700" }}>{initials}</Text>
            )}
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
              {name || "Guest"}
            </Text>
            <Text style={{ color: muted, marginTop: 4 }}>{email ?? ""}</Text>
            <Text style={{ color: muted, marginTop: 2 }}>Coffee lover · Remote</Text>
          </View>
          <Pressable
            onPress={openEditProfile}
            style={{
              marginTop: 6,
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 999,
              backgroundColor: palette.accent,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Edit Profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {[
          {
            label: "Order History",
            value: "",
            icon: "🕘",
            onPress: () => router.push("/(tabs)/history"),
          },
          {
            label: "Language",
            value: language,
            icon: "🌍",
            onPress: () => setLanguage(cycleOption(languageOptions, language)),
          },
          {
            label: "Currency",
            value: currency,
            icon: "💱",
            onPress: () => setCurrency(cycleOption(currencyOptions, currency)),
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 16,
              backgroundColor: cardBackground,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(240,132,47,0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text>{item.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{item.label}</Text>
              {item.value ? (
                <Text style={{ color: muted, marginTop: 2 }}>{item.value}</Text>
              ) : null}
            </View>
            <Text style={{ color: muted, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={handleLogout}
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.2)" : "#ddd",
        }}
      >
        <Text style={{ color: colors.text, textAlign: "center" }}>
          Sign out
        </Text>
      </Pressable>

      <Modal visible={editOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" }}>
          <View
            style={{
              marginHorizontal: 24,
              borderRadius: 20,
              padding: 20,
              backgroundColor: cardBackground,
              gap: 16,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18 }}>
              Edit Profile
            </Text>
            <Pressable
              onPress={() => handleAvatarPress(setDraftAvatar)}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "rgba(0,0,0,0.08)",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                alignSelf: "center",
              }}
            >
              {draftAvatar ? (
                <Image source={{ uri: draftAvatar }} style={{ width: 80, height: 80 }} />
              ) : (
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{initials}</Text>
              )}
            </Pressable>
            <View style={{ gap: 6 }}>
              <Text style={{ color: muted, fontSize: 12 }}>Name</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Your name"
                placeholderTextColor={muted}
                style={{
                  borderWidth: 1,
                  borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.2)" : "#ddd",
                  borderRadius: 12,
                  padding: 12,
                  color: colors.text,
                  backgroundColor: colorScheme === "dark" ? "#1f2a35" : "#fff",
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.2)" : "#ddd",
                }}
              >
                <Text style={{ color: colors.text, textAlign: "center" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveProfile}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: palette.accent,
                }}
              >
                <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
