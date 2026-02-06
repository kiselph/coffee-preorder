import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useCart } from "../../lib/cart";
import { API_URL } from "../../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearAuthToken,
  getAuthToken,
  getAuthUser,
  getRefreshToken,
  setAuthTokens,
  setAuthUser,
} from "../../lib/auth";
import { getProfileAvatar, getProfileName } from "../../lib/profile";
import { useToast } from "../../lib/toast";

export default function CartScreen() {
  const { items, updateQuantity, removeItem, totalCount, clearCart } = useCart();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cafeModalOpen, setCafeModalOpen] = useState(false);
  const [selectedCafeId, setSelectedCafeId] = useState("cafe-1");
  const [selectedPickupMinutes, setSelectedPickupMinutes] = useState(15);
  const [slotRemaining, setSlotRemaining] = useState<number | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);
  const { showToast } = useToast();
  const palette = {
    darkest: "#06141B",
    deep: "#11212D",
    mid: "#253745",
    slate: "#4A5C6A",
    light: "#9BA8AB",
    mist: "#CCD0CF",
  };
  const cardBackground = colorScheme === "dark" ? palette.deep : "#E6E8E7";
  const elevatedBackground = colorScheme === "dark" ? palette.mid : "#D6DAD9";
  const accentSoft = "rgba(181,158,125,0.2)";

  const cafes = useMemo(
    () => [
      {
        id: "cafe-1",
        name: "Cav Co. Downtown",
        address: "12 Main St",
        distance: "0.6 km",
      },
      {
        id: "cafe-2",
        name: "Cav Co. Riverside",
        address: "85 River Ave",
        distance: "1.4 km",
      },
      {
        id: "cafe-3",
        name: "Cav Co. Uptown",
        address: "230 North Blvd",
        distance: "2.1 km",
      },
    ],
    []
  );

  const selectedCafe = useMemo(
    () => cafes.find((cafe) => cafe.id === selectedCafeId) ?? cafes[0],
    [cafes, selectedCafeId]
  );

  const pickupOptions = useMemo(() => [10, 20, 30, 40, 50, 60], []);

  const pickupDate = useMemo(() => {
    const now = new Date();
    const slotMs = 10 * 60 * 1000;
    const rounded = new Date(Math.ceil(now.getTime() / slotMs) * slotMs);
    const offsetMinutes = Math.max(10, selectedPickupMinutes) - 10;
    return new Date(rounded.getTime() + offsetMinutes * 60 * 1000);
  }, [selectedPickupMinutes]);

  useEffect(() => {
    const loadSlotAvailability = async () => {
      setSlotLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/orders/slot-availability?pickup_time=${encodeURIComponent(
            pickupDate.toISOString()
          )}`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load availability");
        }
        setSlotRemaining(typeof payload?.remaining === "number" ? payload.remaining : null);
      } catch (error) {
        console.error("Failed to load slot availability", error);
        setSlotRemaining(null);
      } finally {
        setSlotLoading(false);
      }
    };

    loadSlotAvailability();
  }, [pickupDate]);

  useEffect(() => {
    getAuthToken().then((stored) => setToken(stored));
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await response.json();
    if (!response.ok) return false;

    const accessToken = payload?.session?.access_token as string | undefined;
    const newRefresh = payload?.session?.refresh_token as string | undefined;
    if (!accessToken) return false;

    await setAuthUser(payload?.user ?? null);
    await setAuthTokens(accessToken, newRefresh ?? refreshToken);
    setToken(accessToken);
    return true;
  }, []);

  const handleExpiredSession = useCallback(async () => {
    await clearAuthToken();
    setToken(null);
    Alert.alert("Session expired", "Please log in again.");
  }, []);

  const handleCheckout = useCallback(async () => {
    if (!token) {
      Alert.alert("Sign in first", "You need to be logged in.");
      return;
    }
    if (items.length === 0) {
      Alert.alert("Cart is empty");
      return;
    }

    try {
      setCheckoutLoading(true);
      const pickup = pickupDate.toISOString();
      const authUser = await getAuthUser();
      const profileName = await getProfileName(authUser?.id);
      const profileAvatar = await getProfileAvatar(authUser?.id);
      const fallbackName =
        profileName?.trim() || authUser?.email?.split("@")[0] || "Guest";
      const safeAvatar = profileAvatar?.startsWith("data:") ? profileAvatar : null;

      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
      const orderItems = items.map((item) => ({
        name: item.name,
        size: item.size,
        quantity: item.quantity,
      }));
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_name: fallbackName,
          customer_avatar: safeAvatar,
          pickup_time: pickup,
          total_items: totalItems,
          order_items: orderItems,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (refreshed) {
            return await handleCheckout();
          }
          await handleExpiredSession();
          return;
        }
        if (response.status === 409) {
          showToast(
            "Too many items for that time. Please choose another pickup slot.",
            "error"
          );
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }

      const raw = await AsyncStorage.getItem("order_ids");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (!arr.includes(payload.id)) arr.unshift(payload.id);
      await AsyncStorage.setItem("order_ids", JSON.stringify(arr));

      clearCart();
      showToast("Order created successfully", "success");
      const rawNotes = await AsyncStorage.getItem("order_notifications");
      const existing = rawNotes ? JSON.parse(rawNotes) : [];
      const next = [
        {
          id: payload.id,
          title: "Order placed",
          body: `Pickup at ${pickupDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          orderId: payload.id,
        },
        ...existing,
      ];
      await AsyncStorage.setItem("order_notifications", JSON.stringify(next));
    } catch (error: any) {
      showToast(error?.message ?? "Request failed", "error");
    } finally {
      setCheckoutLoading(false);
    }
  }, [clearCart, handleExpiredSession, items, pickupDate, refreshSession, showToast, token]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );
  const serviceFee = items.length > 0 ? 0 : 0;
  const discount = 0;
  const totalPrice = Math.max(0, subtotal + serviceFee - discount);

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        paddingTop: Math.max(insets.top + 12, 24),
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
        My cart
      </Text>
      <Text style={{ color: colors.text, opacity: 0.7, marginTop: 4 }}>
        {totalCount === 0 ? "Cart is empty" : `${totalCount} items`}
      </Text>

      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {items.map((item) => (
          <View
            key={`${item.id}-${item.size}`}
            style={{
              flexDirection: "row",
              gap: 12,
              borderRadius: 18,
              padding: 12,
              backgroundColor: cardBackground,
              shadowColor: palette.darkest,
              shadowOpacity: 0.2,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Image
              source={{ uri: item.image }}
              style={{ width: 68, height: 68, borderRadius: 14 }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
              {item.size !== "Standard" && (
                <Text style={{ color: colors.text, opacity: 0.7 }}>{item.size}</Text>
              )}
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                ${item.price.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 10 }}>
              <Pressable
                onPress={() => removeItem(item.id, item.size)}
                style={{ padding: 4 }}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>✕</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => updateQuantity(item.id, item.size, item.quantity - 1)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: elevatedBackground,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  }}
                >
                  <Text style={{ color: colors.text }}>-</Text>
                </Pressable>
                <Text style={{ color: colors.text }}>{item.quantity}</Text>
                <Pressable
                  onPress={() => updateQuantity(item.id, item.size, item.quantity + 1)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: accentSoft,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: "700" }}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => setCafeModalOpen(true)}
          style={{
            marginTop: 6,
            padding: 14,
            borderRadius: 16,
            backgroundColor: cardBackground,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {selectedCafe.name}
              </Text>
              <Text style={{ color: colors.text, opacity: 0.6 }}>
                {selectedCafe.address} · {selectedCafe.distance}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Change</Text>
          </View>
        </Pressable>

        <View
          style={{
            padding: 14,
            borderRadius: 16,
            backgroundColor: cardBackground,
            gap: 10,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "700" }}>Pickup time</Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {pickupOptions.map((minutes) => {
              const selected = minutes === selectedPickupMinutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => setSelectedPickupMinutes(minutes)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.accent : elevatedBackground,
                  }}
                >
                  <Text style={{ color: selected ? "white" : colors.text }}>
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.text, opacity: 0.7 }}>
            Pickup at {pickupDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={{ color: colors.text, opacity: 0.6 }}>
            {slotLoading
              ? "Checking capacity..."
              : slotRemaining === null
                ? "Slots remaining: --"
                : `Slots remaining: ${slotRemaining} / 5`}
          </Text>
        </View>

        <View
          style={{
            padding: 16,
            borderRadius: 18,
            backgroundColor: cardBackground,
            shadowColor: palette.darkest,
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, opacity: 0.7 }}>Subtotal</Text>
            <Text style={{ color: colors.text }}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: colors.text, opacity: 0.7 }}>Service fee</Text>
            <Text style={{ color: colors.text }}>${serviceFee.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: colors.text, opacity: 0.7 }}>Discount</Text>
            <Text style={{ color: colors.text }}>${discount.toFixed(2)}</Text>
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              marginVertical: 12,
            }}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Total</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              ${totalPrice.toFixed(2)}
            </Text>
          </View>
          <Pressable
            onPress={handleCheckout}
            disabled={checkoutLoading}
            style={{
              marginTop: 14,
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: checkoutLoading ? palette.light : colors.accent,
            }}
          >
            <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
              {checkoutLoading ? "Processing..." : `Checkout for $${totalPrice.toFixed(2)}`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={cafeModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View
            style={{
              padding: 20,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              backgroundColor: cardBackground,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
                Choose cafe
              </Text>
              <Pressable onPress={() => setCafeModalOpen(false)}>
                <Text style={{ color: colors.text, fontSize: 16 }}>✕</Text>
              </Pressable>
            </View>

            <View
              style={{
                height: 140,
                borderRadius: 16,
                backgroundColor: elevatedBackground,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.text, opacity: 0.7 }}>Map preview (GPS)</Text>
            </View>

            <View style={{ gap: 10 }}>
              {cafes.map((cafe) => {
                const selected = cafe.id === selectedCafeId;
                return (
                  <Pressable
                    key={cafe.id}
                    onPress={() => {
                      setSelectedCafeId(cafe.id);
                      setCafeModalOpen(false);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : "rgba(255,255,255,0.08)",
                      backgroundColor: selected ? accentSoft : "transparent",
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{cafe.name}</Text>
                    <Text style={{ color: colors.text, opacity: 0.6 }}>
                      {cafe.address} · {cafe.distance}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
