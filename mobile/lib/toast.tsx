import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "error" | "info";

type ToastPayload = {
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const COLORS: Record<ToastType, string> = {
  success: "#728A6E",
  error: "#CD0000",
  info: "#B59E7D",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      setToast({ message, type });
      translateY.setValue(-120);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 120,
          mass: 1,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.delay(2400).start(() => {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -120,
              duration: 320,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 260,
              useNativeDriver: true,
            }),
          ]).start(() => setToast(null));
        });
      });
    },
    [opacity, translateY]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 10,
            left: 16,
            right: 16,
            padding: 14,
            borderRadius: 16,
            backgroundColor: COLORS[toast.type],
            transform: [{ translateY }],
            opacity,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
