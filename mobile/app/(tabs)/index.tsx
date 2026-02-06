import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearAuthToken,
  getAuthToken,
  getAuthUser,
  getRefreshToken,
  setAuthTokens,
  setAuthUser
} from "../../lib/auth";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { Colors } from "../../constants/theme";
import { getProfileName } from "../../lib/profile";
import { useCart, type Product, type ProductCategory } from "../../lib/cart";
import { useRouter } from "expo-router";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { BlurView } from "expo-blur";
import { getFavorites, toggleFavorite } from "../../lib/favorites";
import { useToast } from "../../lib/toast";


export default function HomeScreen() {
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [orders, setOrders] = useState<
    { id: string; customer_name: string; pickup_time: string; status: string }[]
  >([]);
  const [progressWidth, setProgressWidth] = useState(0);
  const [dismissedCompletedId, setDismissedCompletedId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Guest");
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("coffee");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<
    "Small" | "Medium" | "Large" | "Standard"
  >("Medium");
  const [notifications, setNotifications] = useState<
    { id: string; title: string; body: string; orderId?: string }[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { showToast } = useToast();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { addToCart } = useCart();
  const router = useRouter();
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
  const accent = colors.accent;
  const placeholderColor = colorScheme === "dark" ? "#aaa" : "#888";
  const insets = useSafeAreaInsets();
  const shimmer = useRef(new Animated.Value(0)).current;
  const completedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(1)).current;
  const closingModal = useRef(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const modalImageHeight = Math.round(Dimensions.get("window").height * 0.48);
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;
  const modalImageRef = useRef<View | null>(null);
  const [flyItem, setFlyItem] = useState<Product | null>(null);
  const flyPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flyScale = useRef(new Animated.Value(1)).current;
  const flyOpacity = useRef(new Animated.Value(0)).current;
  const flySize = 64;
  const [categoryWidth, setCategoryWidth] = useState(0);
  const categoryTranslateX = useRef(new Animated.Value(0)).current;

  const selectedPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    if (selectedProduct.category === "dessert") return selectedProduct.price;
    const modifiers = selectedProduct.size_price_modifiers ?? {};
    const percent = modifiers[selectedSize as "Small" | "Medium" | "Large"] ?? 0;
    const next = selectedProduct.price * (1 + percent / 100);
    return Number.isFinite(next) ? Number(next.toFixed(2)) : selectedProduct.price;
  }, [selectedProduct, selectedSize]);

  const flyToCart = useCallback(() => {
    if (!selectedProduct) return;
  const targetX = screenWidth / 2 - flySize / 2;
    const targetY = screenHeight - insets.bottom - 64;

    modalImageRef.current?.measureInWindow((x, y, width, height) => {
      const startX = x + width / 2 - flySize / 2;
      const startY = y + height / 2 - flySize / 2;

      flyPosition.setValue({ x: startX, y: startY });
      flyScale.setValue(1);
      flyOpacity.setValue(1);
      setFlyItem(selectedProduct);

      Animated.parallel([
        Animated.timing(flyPosition, {
          toValue: { x: targetX, y: targetY },
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(flyScale, {
          toValue: 0.2,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(flyOpacity, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
      ]).start(() => setFlyItem(null));
    });
  }, [flyOpacity, flyPosition, flyScale, flySize, insets.bottom, screenHeight, screenWidth, selectedProduct]);

  const closeModal = useCallback(() => {
    if (closingModal.current) return;
    closingModal.current = true;
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 520,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalScale, {
        toValue: 0.92,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedProduct(null);
      modalTranslateY.setValue(0);
      modalOpacity.setValue(0);
      modalScale.setValue(1);
      closingModal.current = false;
    });
  }, [modalOpacity, modalScale, modalTranslateY]);

  const modalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy > 4;
          const edgeThreshold = 24;
          const isEdge = gesture.x0 < edgeThreshold || gesture.x0 > screenWidth - edgeThreshold;
          const isHorizontal =
            Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 6;
          return isVertical || (isEdge && isHorizontal);
        },
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
            modalTranslateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const edgeThreshold = 24;
          const isEdge = gesture.x0 < edgeThreshold || gesture.x0 > screenWidth - edgeThreshold;
          if (gesture.dy > 120 || (isEdge && Math.abs(gesture.dx) > 120)) {
            closeModal();
            return;
          }
          Animated.spring(modalTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeModal, modalTranslateY, screenWidth]
  );

  const seedProducts: Product[] = useMemo(
    () => [
      {
        id: "pop-1",
        name: "Espresso Con Panna",
        price: 2.69,
        image: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.6,
        description: "Rich espresso with whipped cream for a silky finish.",
        is_popular: true,
      },
      {
        id: "pop-2",
        name: "Latte",
        price: 3.14,
        image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.4,
        description: "Velvety steamed milk with a smooth espresso base.",
        is_popular: true,
      },
      {
        id: "pop-3",
        name: "Chocolate Croissant",
        price: 4.05,
        image: "https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&w=800&q=80",
        category: "dessert",
        rating: 4.7,
        description: "Buttery layers with rich chocolate filling.",
        is_popular: true,
      },
      {
        id: "pop-4",
        name: "Cappuccino",
        price: 4.2,
        image: "https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.5,
        description: "Classic cappuccino with dense foam and cocoa.",
        is_popular: true,
      },
      {
        id: "c-1",
        name: "Flat White",
        price: 3.6,
        image: "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.3,
        description: "Creamy microfoam layered over espresso.",
      },
      {
        id: "c-2",
        name: "Americano",
        price: 2.95,
        image: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.2,
        description: "Bold espresso with hot water.",
      },
      {
        id: "c-3",
        name: "Cappuccino",
        price: 4.2,
        image: "https://images.unsplash.com/photo-1481391032119-d89fee407e44?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.5,
        description: "Foamy espresso topped with cocoa.",
      },
      {
        id: "c-4",
        name: "Mocha",
        price: 4.45,
        image: "https://images.unsplash.com/photo-1481883814864-31d79c1b9bf3?auto=format&fit=crop&w=800&q=80",
        category: "coffee",
        rating: 4.4,
        description: "Espresso blended with chocolate and steamed milk.",
      },
      {
        id: "d-1",
        name: "Tiramisu",
        price: 5.25,
        image: "https://images.unsplash.com/photo-1508736793122-f516e3ba5569?auto=format&fit=crop&w=800&q=80",
        category: "dessert",
        rating: 4.8,
        description: "Coffee-soaked layers with mascarpone cream.",
      },
      {
        id: "d-2",
        name: "Cheesecake",
        price: 4.85,
        image: "https://images.unsplash.com/photo-1505253216365-2d7e9c5c1725?auto=format&fit=crop&w=800&q=80",
        category: "dessert",
        rating: 4.6,
        description: "Classic cheesecake with buttery crust.",
      },
      {
        id: "d-3",
        name: "Cinnamon Roll",
        price: 3.9,
        image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
        category: "dessert",
        rating: 4.4,
        description: "Warm roll with cinnamon sugar glaze.",
      },
      {
        id: "d-4",
        name: "Chocolate Muffin",
        price: 3.4,
        image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
        category: "dessert",
        rating: 4.3,
        description: "Soft muffin with rich cocoa chunks.",
      },
    ],
    []
  );
  const [products, setProducts] = useState<Product[]>(seedProducts);

  const popularItems = useMemo(() => {
    const popular = products.filter((item) => item.is_popular);
    if (popular.length > 0) return popular;
    return products.slice(0, 4);
  }, [products]);

  const filteredMenu = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return products.filter((item) => {
      const matchesCategory = item.category === selectedCategory;
      const matchesQuery = query.length === 0 || item.name.toLowerCase().includes(query);
      const active = item.is_active !== false;
      return matchesCategory && matchesQuery && active;
    });
  }, [products, searchText, selectedCategory]);

  const filteredPopular = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return popularItems;
    return popularItems.filter((item) => item.name.toLowerCase().includes(query));
  }, [popularItems, searchText]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [shimmer]);


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
    Alert.alert("Session expired", "Please log in again.");
  }, []);

  const activeOrder = useMemo(() => {
    const inProgress = orders.find((order) => order.status !== "picked_up");
    return inProgress ?? orders[0];
  }, [orders]);

  const showActiveOrder = useMemo(() => {
    if (!activeOrder) return false;
    if (activeOrder.status !== "picked_up") return true;
    return dismissedCompletedId !== activeOrder.id;
  }, [activeOrder, dismissedCompletedId]);

  const progressIndex = useMemo(() => {
    const status = activeOrder?.status ?? "new";
    if (status === "accepted") return 1;
    if (status === "ready") return 2;
    if (status === "picked_up") return 3;
    return 0;
  }, [activeOrder?.status]);

  const statusLabel = useMemo(() => {
    if (!activeOrder) return "";
    return activeOrder.status === "picked_up" ? "completed" : activeOrder.status;
  }, [activeOrder]);

  useEffect(() => {
    AsyncStorage.getItem("dismissed_completed_order_id").then((stored) => {
      if (stored) {
        setDismissedCompletedId(stored);
      }
    });
  }, []);

  useEffect(() => {
    if (completedTimer.current) {
      clearTimeout(completedTimer.current);
      completedTimer.current = null;
    }

    if (!activeOrder) return;

    if (activeOrder.status === "picked_up") {
      if (dismissedCompletedId === activeOrder.id) return;
      completedTimer.current = setTimeout(() => {
        setDismissedCompletedId(activeOrder.id);
        AsyncStorage.setItem("dismissed_completed_order_id", activeOrder.id);
      }, 60_000);
    } else {
      if (dismissedCompletedId) {
        setDismissedCompletedId(null);
        AsyncStorage.removeItem("dismissed_completed_order_id");
      }
    }

    return () => {
      if (completedTimer.current) {
        clearTimeout(completedTimer.current);
        completedTimer.current = null;
      }
    };
  }, [activeOrder, dismissedCompletedId]);

  const loadOrders = useCallback(async () => {
    try {
      if (!token) return;
      const raw = await AsyncStorage.getItem("order_ids");
      const ids: string[] = raw ? JSON.parse(raw) : [];

      if (ids.length === 0) {
        setOrders([]);
        return;
      }

      const response = await fetch(
        `${API_URL}/orders?ids=${encodeURIComponent(ids.join(","))}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (refreshed) {
            return await loadOrders();
          }
          await handleExpiredSession();
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }
      setOrders(payload as any);
    } catch (error) {
      console.error("Failed to load orders", error);
    }
  }, [handleExpiredSession, refreshSession, token]);

  useEffect(() => {
    if (!token) return;

    loadOrders();
    const interval = setInterval(() => {
      loadOrders();
    }, 8000);

    return () => clearInterval(interval);
  }, [loadOrders, token]);

  async function handleAuth(path: "signup" | "login") {
    if (!email || !password) {
      Alert.alert("Enter email and password");
      return;
    }

    try {
      setAuthLoading(true);
      const response = await fetch(`${API_URL}/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (!refreshed) {
            await handleExpiredSession();
          }
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }

      const accessToken = payload?.session?.access_token as string | undefined;
      const refreshToken = payload?.session?.refresh_token as string | undefined;
      if (!accessToken) {
        Alert.alert(
          "Check your email",
          "Please confirm your email from the Supabase email to log in."
        );
        return;
      }

      await setAuthUser(payload?.user ?? null);
      await setAuthTokens(accessToken, refreshToken);
      setToken(accessToken);
      Alert.alert("Success", path === "signup" ? "Signed up" : "Logged in");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setAuthLoading(false);
    }
  }

  const bootstrapAuth = useCallback(async () => {
    const stored = await getAuthToken();
    if (stored) {
      setToken(stored);
      return;
    }
    await refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (selectedProduct) {
      modalTranslateY.setValue(0);
      modalOpacity.setValue(0);
      modalScale.setValue(0.98);
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      Animated.spring(modalScale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [modalOpacity, modalScale, modalTranslateY, selectedProduct]);

  useEffect(() => {
    if (!categoryWidth) return;
    const index = selectedCategory === "coffee" ? 0 : 1;
    Animated.spring(categoryTranslateX, {
      toValue: index * (categoryWidth / 2),
      useNativeDriver: true,
      stiffness: 180,
      damping: 18,
      mass: 0.8,
    }).start();
  }, [categoryTranslateX, categoryWidth, selectedCategory]);

  useEffect(() => {
    if (!selectedProduct) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeModal();
      return true;
    });
    return () => subscription.remove();
  }, [closeModal, selectedProduct]);

  useEffect(() => {
    getFavorites().then((items) => setFavoriteIds(items.map((item) => item.id)));
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch(`${API_URL}/products`);
        const payload = await response.json();
        if (response.ok && Array.isArray(payload) && payload.length > 0) {
          setProducts(payload as Product[]);
        }
      } catch (error) {
        console.error("Failed to load products", error);
      }
    };

    loadProducts();
  }, []);

  useEffect(() => {
    (async () => {
      const authUser = await getAuthUser();
      const name = await getProfileName(authUser?.id);
      setDisplayName(name?.trim() || authUser?.email?.split("@")[0] || "Guest");
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("order_notifications").then((raw) => {
      if (!raw) return;
      try {
        setNotifications(JSON.parse(raw));
      } catch {
        setNotifications([]);
      }
    });
  }, []);


  return (
    <View
      style={{
        flex: 1,
        paddingTop: Math.max(insets.top + 12, 24),
        backgroundColor: colors.background,
      }}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, opacity: 0.7 }}>Hello, {displayName}</Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.text }}>
              Let’s order coffee
            </Text>
          </View>
          <Pressable
            onPress={() => setNotificationsOpen(true)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: elevatedBackground,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSymbol name="bell.fill" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: cardBackground,
          }}
        >
          <IconSymbol name="magnifyingglass" size={20} color={colors.text} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search coffee"
            placeholderTextColor={placeholderColor}
            style={{ flex: 1, color: colors.text }}
          />
        </View>

        {!token ? (
          <View
            style={{
              marginTop: 24,
              gap: 12,
              padding: 16,
              borderRadius: 16,
              backgroundColor: cardBackground,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Sign in</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                borderWidth: 1,
                borderColor: palette.light,
                borderRadius: 12,
                padding: 12,
                backgroundColor: elevatedBackground,
                color: colors.text,
              }}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={placeholderColor}
              secureTextEntry
              style={{
                borderWidth: 1,
                borderColor: palette.light,
                borderRadius: 12,
                padding: 12,
                backgroundColor: elevatedBackground,
                color: colors.text,
              }}
            />
            <Pressable
              onPress={() => setAuthMode(authMode === "login" ? "signup" : "login")}
              style={{
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: palette.slate,
                backgroundColor: elevatedBackground,
              }}
            >
              <Text style={{ color: colors.text, textAlign: "center" }}>
                {authMode === "login" ? "Sign up" : "Log in"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleAuth(authMode)}
              disabled={authLoading}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: authLoading ? palette.light : palette.mid,
              }}
            >
              <Text style={{ color: "white", textAlign: "center" }}>
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Login"
                    : "Sign up"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {showActiveOrder && activeOrder && (
              <View
                style={{
                  marginTop: 20,
                  borderRadius: 16,
                  padding: 14,
                  backgroundColor: cardBackground,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>
                    {activeOrder.status === "picked_up" ? "Completed" : "Active order"}
                  </Text>
                  {activeOrder.status === "picked_up" && (
                    <Pressable
                      onPress={() => {
                        setDismissedCompletedId(activeOrder.id);
                        AsyncStorage.setItem("dismissed_completed_order_id", activeOrder.id);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                    >
                      <Text style={{ color: colors.text, fontSize: 18 }}>✕</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={{ color: colors.text, opacity: 0.8, marginTop: 6 }}>
                  Status: {statusLabel}
                </Text>
                <Text style={{ color: colors.text, opacity: 0.7 }}>
                  Pickup: {new Date(activeOrder.pickup_time).toLocaleString()}
                </Text>
                <View
                  onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
                  style={{
                    height: 16,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: palette.slate,
                    overflow: "hidden",
                    flexDirection: "row",
                    backgroundColor: elevatedBackground,
                    marginTop: 8,
                  }}
                >
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={{
                        flex: 1,
                        marginHorizontal: index === 1 ? 2 : 0,
                        backgroundColor: progressIndex > index ? accent : "transparent",
                        borderRightWidth: index < 2 ? 1 : 0,
                        borderRightColor: palette.slate,
                      }}
                    />
                  ))}
                  {progressWidth > 0 && (
                    <Animated.View
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: progressWidth * 0.4,
                        backgroundColor: "rgba(255,255,255,0.08)",
                        transform: [
                          {
                            translateX: shimmer.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-progressWidth * 0.6, progressWidth * 1.6],
                            }),
                          },
                        ],
                      }}
                    />
                  )}
                </View>
              </View>
            )}

            <View style={{ marginTop: 24 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                  Popular choices
                </Text>
                <Text style={{ color: colors.accent, fontWeight: "700" }}>See all</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
              >
                {filteredPopular.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setSelectedProduct(item);
                      setSelectedSize(item.category === "dessert" ? "Standard" : "Medium");
                    }}
                    style={{
                      width: 220,
                      borderRadius: 18,
                      backgroundColor: cardBackground,
                      overflow: "hidden",
                      shadowColor: palette.darkest,
                      shadowOpacity: 0.25,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 6,
                    }}
                  >
                    <Image source={{ uri: item.image }} style={{ width: "100%", height: 130 }} />
                    <View style={{ padding: 12, gap: 6 }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
                      <Text style={{ color: colors.text, opacity: 0.7 }}>${item.price.toFixed(2)}</Text>
                      <Text style={{ color: colors.text, opacity: 0.6, fontSize: 12 }}>
                        ⭐ {item.rating?.toFixed(1)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.accent }}>
                Browse by categories
              </Text>
              <View
                onLayout={(event) => setCategoryWidth(event.nativeEvent.layout.width)}
                style={{
                  flexDirection: "row",
                  marginTop: 12,
                  borderRadius: 20,
                  backgroundColor: cardBackground,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Animated.View
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: 4,
                    width: categoryWidth / 2 - 8,
                    borderRadius: 16,
                    backgroundColor: accent,
                    transform: [{ translateX: categoryTranslateX }],
                  }}
                />
                {(["coffee", "dessert"] as ProductCategory[]).map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => setSelectedCategory(category)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color: selectedCategory === category ? "white" : colors.text,
                        fontWeight: selectedCategory === category ? "700" : "600",
                      }}
                    >
                      {category === "coffee" ? "Coffee" : "Desserts"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, marginTop: 14 }}
              >
                {filteredMenu.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setSelectedProduct(item);
                      setSelectedSize(item.category === "dessert" ? "Standard" : "Medium");
                    }}
                    style={{
                      width: 170,
                      borderRadius: 20,
                      padding: 12,
                      backgroundColor: cardBackground,
                      shadowColor: palette.darkest,
                      shadowOpacity: 0.2,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 5,
                    }}
                  >
                    <Image
                      source={{ uri: item.image }}
                      style={{ width: "100%", height: 110, borderRadius: 16, marginBottom: 10 }}
                    />
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
                    <Text style={{ color: colors.text, opacity: 0.7, marginTop: 4 }}>
                      ${item.price.toFixed(2)}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setSelectedProduct(item);
                        setSelectedSize(item.category === "dessert" ? "Standard" : "Medium");
                      }}
                      style={{
                        marginTop: 10,
                        alignSelf: "flex-end",
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 18 }}>+</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedProduct} animationType="none" transparent>
        <Animated.View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.45)",
            opacity: modalOpacity,
          }}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Pressable style={{ flex: 1 }} onPress={closeModal} />
            {selectedProduct && (
              <Animated.View
                {...modalPanResponder.panHandlers}
                style={{
                  backgroundColor: colorScheme === "dark" ? palette.deep : palette.mist,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 32,
                  overflow: "hidden",
                  transform: [{ translateY: modalTranslateY }, { scale: modalScale }],
                }}
              >
                <View ref={modalImageRef}>
                  <Image
                    source={{ uri: selectedProduct.image }}
                    style={{ width: "100%", height: modalImageHeight }}
                    resizeMode="cover"
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: 16,
                      left: 16,
                      right: 16,
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Pressable
                      onPress={closeModal}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconSymbol name="chevron.left" size={20} color="white" />
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        const updated = await toggleFavorite(selectedProduct);
                        setFavoriteIds(updated.map((item) => item.id));
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconSymbol
                        name="heart.fill"
                        size={20}
                        color={favoriteIds.includes(selectedProduct.id) ? "#ff6b4a" : "white"}
                      />
                    </Pressable>
                  </View>
                </View>

                <BlurView
                  intensity={60}
                  tint={colorScheme === "dark" ? "dark" : "light"}
                  style={{
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      padding: 24,
                      gap: 16,
                      minHeight: 240,
                      backgroundColor: "rgba(10,20,28,0.35)",
                    }}
                  >
                    <View
                      style={{
                        borderRadius: 22,
                        padding: 18,
                        backgroundColor: "rgba(0,0,0,0.35)",
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>
                          {selectedProduct.name}
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: "white" }}>
                          ${selectedPrice.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={{ color: "#e5e7eb", marginTop: 6 }}>
                        ⭐ {selectedProduct.rating?.toFixed(1) ?? "4.5"}
                      </Text>
                      <Text style={{ color: "#e5e7eb", marginTop: 10, opacity: 0.8 }}>
                        {selectedProduct.description}
                      </Text>
                    </View>

                    {selectedProduct.category === "dessert" ? (
                      <View
                        style={{
                          paddingVertical: 12,
                          borderRadius: 16,
                          backgroundColor: elevatedBackground,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: colors.text }}>Standard size</Text>
                      </View>
                    ) : (
                      <View>
                        <Text style={{ color: colors.text, opacity: 0.8, marginBottom: 8 }}>
                          Beverage size
                        </Text>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          {(["Small", "Medium", "Large"] as const).map((size, index) => (
                            <Pressable
                              key={size}
                              onPress={() => {
                                setSelectedSize(size);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              style={{ alignItems: "center", flex: 1 }}
                            >
                              <View
                                style={{
                                  width: 58,
                                  height: 58,
                                  borderRadius: 18,
                                  borderWidth: 1,
                                  borderColor: selectedSize === size ? accent : palette.slate,
                                  backgroundColor:
                                    selectedSize === size
                                      ? "rgba(74,92,106,0.25)"
                                      : "transparent",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Text style={{ color: colors.text, fontWeight: "600" }}>
                                  {index === 0 ? "S" : index === 1 ? "M" : "L"}
                                </Text>
                              </View>
                              <Text style={{ color: colors.text, marginTop: 4 }}>{size}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    <Pressable
                      onPress={async () => {
                        addToCart({
                          ...selectedProduct,
                          price: selectedPrice,
                          size: selectedProduct.category === "dessert" ? "Standard" : selectedSize,
                        });
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        flyToCart();
                        closeModal();
                        showToast("Added to cart", "success");
                      }}
                      style={{
                        paddingVertical: 14,
                        borderRadius: 16,
                        backgroundColor: accent,
                      }}
                    >
                      <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>
                        Add to cart
                      </Text>
                    </Pressable>
                  </View>
                </BlurView>
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </Modal>
      {flyItem && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: flySize,
            height: flySize,
            borderRadius: 16,
            overflow: "hidden",
            transform: [
              { translateX: flyPosition.x },
              { translateY: flyPosition.y },
              { scale: flyScale },
            ],
            opacity: flyOpacity,
          }}
        >
          <Image source={{ uri: flyItem.image }} style={{ width: "100%", height: "100%" }} />
        </Animated.View>
      )}
      <Modal visible={notificationsOpen} transparent animationType="fade">
        <Pressable
          onPress={() => setNotificationsOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-start" }}
        >
          <View
            style={{
              marginTop: insets.top + 12,
              marginHorizontal: 16,
              borderRadius: 16,
              backgroundColor: cardBackground,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Notifications</Text>
            {notifications.length === 0 ? (
              <Text style={{ color: colors.text, opacity: 0.6 }}>No notifications yet.</Text>
            ) : (
              notifications.map((note) => (
                <Pressable
                  key={note.id}
                  onPress={() => {
                    setNotificationsOpen(false);
                    if (note.orderId) {
                      router.push("/(tabs)/history");
                    }
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: elevatedBackground,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{note.title}</Text>
                  <Text style={{ color: colors.text, opacity: 0.7 }}>{note.body}</Text>
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
