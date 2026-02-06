import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../../lib/api";
import { useFocusEffect } from "expo-router";
import {
  clearAuthToken,
  getAuthToken,
  getRefreshToken,
  setAuthTokens,
  setAuthUser
} from "../../lib/auth";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { Colors } from "../../constants/theme";
import { type Product } from "../../lib/cart";


const ORDER_IDS_KEY = "order_ids";

type Order = {
  id: string;
  customer_name: string;
  pickup_time: string;
  status: string;
  created_at: string;
  order_items?: {
    name: string;
    size: string;
    quantity: number;
  }[];
};

export default function HistoryScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
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
  const screenHeight = Dimensions.get("window").height;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.name.toLowerCase(), product])),
    [products]
  );
  const placeholderImage =
    "https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?auto=format&fit=crop&w=200&q=80";

  const normalizeStatus = useCallback((status?: string) => {
    if (!status) return "new";
    if (status === "picked_up" || status === "completed") return "completed";
    if (status === "ready") return "ready";
    if (status === "in_progress" || status === "preparing") return "in_progress";
    return "new";
  }, []);

  const statusRank = useMemo(
    () => ({ new: 0, in_progress: 1, ready: 2, completed: 3 }),
    []
  );

  const statusLabels = useMemo(
    () => ({ new: "New order", in_progress: "In progress", ready: "Ready", completed: "Completed" }),
    []
  );

  const formatCurrency = useCallback((value: number) => `$${value.toFixed(2)}`, []);

  const getItemPrice = useCallback(
    (item: NonNullable<Order["order_items"]>[number]) => {
      const product = productMap.get(item.name.toLowerCase());
      if (!product) return 0;
      if (product.category === "dessert" || item.size === "Standard") return product.price;
      const percent = product.size_price_modifiers?.[item.size as "Small" | "Medium" | "Large"] ?? 0;
      const next = product.price * (1 + percent / 100);
      return Number.isFinite(next) ? Number(next.toFixed(2)) : product.price;
    },
    [productMap]
  );

  const openModal = useCallback(() => {
    setModalVisible(true);
    slideAnim.setValue(screenHeight);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, screenHeight, slideAnim]);

  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedOrder(null);
    });
  }, [backdropOpacity, screenHeight, slideAnim]);

  useEffect(() => {
    getAuthToken().then((stored) => setToken(stored));
  }, []);

  useEffect(() => {
    if (selectedOrder) {
      openModal();
    }
  }, [openModal, selectedOrder]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setProductsLoading(true);
        const response = await fetch(`${API_URL}/products`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load products");
        }
        setProducts(payload as Product[]);
      } catch (error) {
        console.error("Failed to load products", error);
      } finally {
        setProductsLoading(false);
      }
    };

    loadProducts();
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
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
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      if (!token) {
        setOrders([]);
        return;
      }
      setLoading(true);
      const raw = await AsyncStorage.getItem(ORDER_IDS_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];

      if (ids.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_URL}/orders?ids=${encodeURIComponent(ids.join(","))}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (refreshed) {
            return await loadHistory();
          }
          await handleExpiredSession();
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }
      setOrders(payload as any);
      const ready = (payload as Order[]).filter(
        (order) => order.status === "ready" || order.status === "picked_up"
      );
      if (ready.length > 0) {
        const rawNotes = await AsyncStorage.getItem("order_notifications");
        const existing = rawNotes ? JSON.parse(rawNotes) : [];
        const existingIds = new Set(existing.map((note: any) => note.id));
        const next = [...existing];
        ready.forEach((order) => {
          if (existingIds.has(order.id)) return;
          next.unshift({
            id: order.id,
            title: order.status === "ready" ? "Order ready" : "Order completed",
            body: `Pickup at ${new Date(order.pickup_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            orderId: order.id,
          });
        });
        await AsyncStorage.setItem("order_notifications", JSON.stringify(next));
      }
    } catch (error) {
      console.error("History load failed", error);
    } finally {
      setLoading(false);
    }
  }, [handleExpiredSession, refreshSession, token]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadHistory();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [loadHistory]);

  async function clearHistory() {
    await AsyncStorage.removeItem(ORDER_IDS_KEY);
    setOrders([]);
  }

  useFocusEffect(
    useCallback(() => {
      getAuthToken().then((stored) => {
        setToken(stored);
        if (stored) {
          loadHistory();
        }
      });
    }, [loadHistory])
  );
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        paddingTop: Math.max(insets.top + 12, 24),
        gap: 12,
        backgroundColor: colors.background
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text }}>
        History
      </Text>

      <Pressable
        onPress={loadHistory}
        style={{ padding: 12, borderRadius: 12, backgroundColor: "#111" }}
      >
        <Text style={{ color: "white", textAlign: "center" }}>
          {loading ? "Loading..." : "Refresh"}
        </Text>
      </Pressable>

      <Pressable
        onPress={clearHistory}
        style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#333" }}
      >
        <Text style={{ color: colors.text, textAlign: "center", opacity: 0.8 }}>
          Clear history
        </Text>
      </Pressable>

      {!token && (
        <Text style={{ opacity: 0.7, color: colors.text }}>
          Sign in to see your order history.
        </Text>
      )}

      {token ? (
        orders.length === 0 ? (
          <Text style={{ opacity: 0.7, color: colors.text }}>No orders yet.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {orders.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setSelectedOrder(o)}
                style={{
                  borderWidth: 1,
                  borderColor: "#333",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18 }}>
                  {o.customer_name}
                </Text>

                <Text style={{ color: colors.text, opacity: 0.8, marginTop: 6 }}>
                  Pickup: {new Date(o.pickup_time).toLocaleString()}
                </Text>

                <Text style={{ color: colors.text, opacity: 0.8 }}>
                  Status: {o.status === "picked_up" ? "completed" : o.status}
                </Text>
                {o.order_items && o.order_items.length > 0 && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {o.order_items.map((item, index) => (
                      <Text key={`${o.id}-item-${index}`} style={{ color: colors.text, opacity: 0.75 }}>
                        {item.quantity} × {item.name} ({item.size})
                      </Text>
                    ))}
                  </View>
                )}

                <Text
                  style={{ color: colors.text, opacity: 0.5, fontSize: 12, marginTop: 6 }}
                >
                  {o.id}
                </Text>
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      <Modal visible={modalVisible} transparent animationType="none">
        <View style={{ flex: 1 }}>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: backdropOpacity,
            }}
          />
          <Pressable
            onPress={closeModal}
            style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}
          />
          {selectedOrder && (() => {
            const normalizedStatus = normalizeStatus(selectedOrder.status);
            const rank = statusRank[normalizedStatus];
            const createdTime = selectedOrder.created_at
              ? new Date(selectedOrder.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "";
            const pickupTime = new Date(selectedOrder.pickup_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const items = selectedOrder.order_items ?? [];
            const totalAmount = items.reduce(
              (sum, item) => sum + getItemPrice(item) * item.quantity,
              0
            );
            const timeline = [
              { key: "placed", label: "Order placed", time: createdTime, done: true },
              { key: "progress", label: "Order in progress", time: rank >= 1 ? createdTime : "", done: rank >= 1 },
              { key: "ready", label: "Ready for pickup", time: rank >= 2 ? pickupTime : "", done: rank >= 2 },
              { key: "completed", label: "Order completed", time: rank >= 3 ? pickupTime : "", done: rank >= 3 },
            ];

            return (
              <Animated.View
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  top: Math.max(insets.top + 12, 24),
                  bottom: 0,
                  borderRadius: 24,
                  backgroundColor: cardBackground,
                  overflow: "hidden",
                  transform: [{ translateY: slideAnim }],
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingTop: 18,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(0,0,0,0.08)",
                  }}
                >
                  <View>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>
                      Detail Order
                    </Text>
                    <Text style={{ color: colors.text, opacity: 0.6, marginTop: 4 }}>
                      Order ID {selectedOrder.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeModal}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.08)",
                    }}
                  >
                    <Text style={{ fontSize: 18, color: colors.text }}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={{
                    padding: 20,
                    paddingBottom: Math.max(insets.bottom + 24, 32),
                    gap: 16,
                  }}
                >
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.text, opacity: 0.7 }}>
                      {new Date(selectedOrder.pickup_time).toLocaleString()}
                    </Text>
                    <View
                      style={{
                        alignSelf: "flex-start",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: "rgba(94,177,89,0.15)",
                      }}
                    >
                      <Text style={{ color: "#4E9A4D", fontWeight: "600" }}>
                        {statusLabels[normalizedStatus]}
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 12 }}>
                    {items.length === 0 ? (
                      <Text style={{ color: colors.text, opacity: 0.7 }}>
                        No item details.
                      </Text>
                    ) : (
                      items.map((item, index) => {
                        const product = productMap.get(item.name.toLowerCase());
                        const unitPrice = getItemPrice(item);
                        const imageSource = product?.image ? { uri: product.image } : { uri: placeholderImage };
                        return (
                          <View
                            key={`${selectedOrder.id}-detail-${index}`}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                              padding: 12,
                              borderRadius: 16,
                              backgroundColor: elevatedBackground,
                            }}
                          >
                            <Image
                              source={imageSource}
                              style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: "#222" }}
                            />
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
                              <Text style={{ color: colors.text, opacity: 0.7 }}>{item.size}</Text>
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 4 }}>
                              <Text style={{ color: colors.text, fontWeight: "600" }}>
                                {formatCurrency(unitPrice)}
                              </Text>
                              <Text style={{ color: colors.text, opacity: 0.7 }}>Qty: {item.quantity}</Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>

                  <View style={{ gap: 8, padding: 16, borderRadius: 16, backgroundColor: elevatedBackground }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.text, opacity: 0.7 }}>Amount</Text>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>
                        {formatCurrency(totalAmount)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.text, opacity: 0.7 }}>Discount</Text>
                      <Text style={{ color: colors.text, opacity: 0.8 }}>$0.00</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.15)" }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>Total</Text>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {formatCurrency(totalAmount)}
                      </Text>
                    </View>
                    {productsLoading && (
                      <Text style={{ color: colors.text, opacity: 0.6, marginTop: 6 }}>
                        Updating product details...
                      </Text>
                    )}
                  </View>

                  <View style={{ gap: 12 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
                      Timeline Order
                    </Text>
                    <View style={{ gap: 16 }}>
                      {timeline.map((step, index) => (
                        <View key={step.key} style={{ flexDirection: "row", gap: 12 }}>
                          <View style={{ alignItems: "center" }}>
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 9,
                                backgroundColor: step.done ? "#4E9A4D" : "rgba(0,0,0,0.2)",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {step.done ? (
                                <Text style={{ color: "white", fontSize: 12 }}>✓</Text>
                              ) : null}
                            </View>
                            {index < timeline.length - 1 && (
                              <View
                                style={{
                                  width: 2,
                                  flex: 1,
                                  backgroundColor: "rgba(0,0,0,0.15)",
                                  marginTop: 2,
                                }}
                              />
                            )}
                          </View>
                          <View style={{ flex: 1, paddingBottom: 4 }}>
                            <Text style={{ color: colors.text, fontWeight: "600" }}>{step.label}</Text>
                            {step.time ? (
                              <Text style={{ color: colors.text, opacity: 0.6 }}>{step.time}</Text>
                            ) : (
                              <Text style={{ color: colors.text, opacity: 0.35 }}>Pending</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </Animated.View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}
