import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ProductCategory = "coffee" | "dessert";

export type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  category: ProductCategory;
  rating?: number;
  description?: string;
  is_active?: boolean;
  is_popular?: boolean;
  size_price_modifiers?: {
    Small?: number;
    Medium?: number;
    Large?: number;
  } | null;
};

export type CartItem = Product & {
  size: "Small" | "Medium" | "Large" | "Standard";
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (id: string, size: CartItem["size"], quantity: number) => void;
  removeItem: (id: string, size: CartItem["size"]) => void;
  clearCart: () => void;
  totalCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const CART_KEY = "cart_items";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(CART_KEY).then((stored) => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as CartItem[];
        setItems(parsed);
      } catch {
        setItems([]);
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart: CartContextValue["addToCart"] = (item, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id && entry.size === item.size);
      if (!existing) {
        return [...prev, { ...item, quantity }];
      }
      return prev.map((entry) =>
        entry.id === item.id && entry.size === item.size
          ? { ...entry, quantity: entry.quantity + quantity }
          : entry
      );
    });
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (id, size, quantity) => {
    setItems((prev) =>
      prev
        .map((entry) =>
          entry.id === id && entry.size === size
            ? { ...entry, quantity: Math.max(1, quantity) }
            : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  };

  const removeItem: CartContextValue["removeItem"] = (id, size) => {
    setItems((prev) => prev.filter((entry) => !(entry.id === id && entry.size === size)));
  };

  const clearCart = () => setItems([]);

  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addToCart, updateQuantity, removeItem, clearCart, totalCount }),
    [items, totalCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
