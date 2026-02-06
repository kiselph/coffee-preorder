"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { API_URL } from "../lib/api";

type Order = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_avatar?: string | null;
  pickup_time: string;
  status: string;
  order_items?: {
    name: string;
    size: string;
    quantity: number;
  }[];
};

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [inviteCode, setInviteCode] = useState("");
  const [ordersTab, setOrdersTab] = useState<"active" | "history">("active");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [baristaName, setBaristaName] = useState("Barista");
  const [baristaAvatar, setBaristaAvatar] = useState<string | null>(null);
  const [isBarista, setIsBarista] = useState<boolean | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const refreshTokenKey = "refresh_token";

  const getStoredRefreshToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(refreshTokenKey);
  }, [refreshTokenKey]);

  const handleExpiredSession = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem(refreshTokenKey);
    }
    setToken(null);
    setIsBarista(null);
    setOrders([]);
  }, [refreshTokenKey]);

  const refreshSession = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    const payload = await response.json();
    if (!response.ok) return null;

    const accessToken = payload?.session?.access_token as string | undefined;
    const newRefresh = payload?.session?.refresh_token as string | undefined;
    if (!accessToken) return null;

    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", accessToken);
      localStorage.setItem(refreshTokenKey, newRefresh ?? refreshToken);
    }
    setToken(accessToken);
    setIsBarista(Boolean(payload?.isBarista));
    return accessToken;
  }, [getStoredRefreshToken, refreshTokenKey]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    setToken(stored);
    const storedName = typeof window !== "undefined" ? localStorage.getItem("barista_name") : null;
    const storedAvatar = typeof window !== "undefined" ? localStorage.getItem("barista_avatar") : null;
    if (storedName) setBaristaName(storedName);
    if (storedAvatar) setBaristaAvatar(storedAvatar);

    if (!stored) {
      refreshSession();
    }
  }, [refreshSession]);

  const loadBaristaStatus = useCallback(async () => {
    if (!token) {
      setIsBarista(null);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (!refreshed) {
            handleExpiredSession();
            return;
          }
          const retry = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${refreshed}` }
          });
          const retryPayload = await retry.json();
          if (!retry.ok) throw new Error(retryPayload?.error ?? "Request failed");
          setIsBarista(Boolean(retryPayload?.isBarista));
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }
      setIsBarista(Boolean(payload?.isBarista));
    } catch (error) {
      console.error("Failed to load barista status", error);
    }
  }, [handleExpiredSession, refreshSession, token]);

  function updateBaristaName(value: string) {
    setBaristaName(value);
    localStorage.setItem("barista_name", value);
  }

  function updateBaristaAvatar() {
    const next = window.prompt("Paste an image URL for your avatar");
    if (!next) return;
    setBaristaAvatar(next);
    localStorage.setItem("barista_avatar", next);
  }

  async function handleLogin() {
    if (!email || !password) {
      alert("Введите email и пароль");
      return;
    }

    try {
      setAuthLoading(true);
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Request failed");

      const accessToken = payload?.session?.access_token as string | undefined;
      const refreshToken = payload?.session?.refresh_token as string | undefined;
      if (!accessToken) {
        alert("Нужно подтвердить email в письме от Supabase.");
        return;
      }

      localStorage.setItem("auth_token", accessToken);
      if (refreshToken) {
        localStorage.setItem(refreshTokenKey, refreshToken);
      }
      setToken(accessToken);
      setIsBarista(Boolean(payload?.isBarista));
      loadBaristaStatus();
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Ошибка входа"));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister() {
    if (!email || !password || !inviteCode) {
      alert("Введите email, пароль и код приглашения");
      return;
    }

    try {
      setAuthLoading(true);
      const response = await fetch(`${API_URL}/auth/barista-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, inviteCode })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Request failed");

      const accessToken = payload?.session?.access_token as string | undefined;
      const refreshToken = payload?.session?.refresh_token as string | undefined;
      if (!accessToken) {
        alert("Проверьте почту для подтверждения.");
        return;
      }

      localStorage.setItem("auth_token", accessToken);
      if (refreshToken) {
        localStorage.setItem(refreshTokenKey, refreshToken);
      }
      setToken(accessToken);
      setIsBarista(Boolean(payload?.isBarista));
      loadBaristaStatus();
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Ошибка регистрации"));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    handleExpiredSession();
  }

  async function handleGrantAccess() {
    if (!inviteCode) {
      alert("Введите код приглашения");
      return;
    }
    if (!token) {
      alert("Сначала войдите");
      return;
    }

    try {
      setAccessLoading(true);
      const response = await fetch(`${API_URL}/auth/barista-grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ inviteCode })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Request failed");
      setIsBarista(true);
      setInviteCode("");
      await load();
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Не удалось подтвердить доступ"));
    } finally {
      setAccessLoading(false);
    }
  }

  const load = useCallback(async () => {
    try {
      if (!token) {
        if (!hasLoadedOnce) setLoading(false);
        return;
      }
      if (!hasLoadedOnce) setLoading(true);
      const response = await fetch(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (!refreshed) {
            handleExpiredSession();
            return;
          }
          const retry = await fetch(`${API_URL}/orders`, {
            headers: { Authorization: `Bearer ${refreshed}` }
          });
          const retryPayload = await retry.json();
          if (!retry.ok) {
            throw new Error(retryPayload?.error ?? "Request failed");
          }
          setOrders(retryPayload as Order[]);
          setHasLoadedOnce(true);
          return;
        }
        throw new Error(payload?.error ?? "Request failed");
      }
      setOrders(payload as Order[]);
      setHasLoadedOnce(true);
    } catch (error: unknown) {
      console.error("Failed to load orders", error);
    } finally {
      if (!hasLoadedOnce) setLoading(false);
    }
  }, [handleExpiredSession, hasLoadedOnce, refreshSession, token]);

  useEffect(() => {
    loadBaristaStatus();
  }, [loadBaristaStatus]);

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      load();
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [load]);

  const setStatus = useCallback(
    async (id: string, status: string) => {
      if (!token) {
        alert("Сначала войдите");
        return;
      }

      setOrders((prev) =>
        prev.map((order) => (order.id === id ? { ...order, status } : order))
      );

      try {
        const response = await fetch(`${API_URL}/orders/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ status })
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload?.error === "Invalid or expired token") {
            const refreshed = await refreshSession();
            if (!refreshed) {
              handleExpiredSession();
              return;
            }
            const retry = await fetch(`${API_URL}/orders/${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${refreshed}`
              },
              body: JSON.stringify({ status })
            });
            const retryPayload = await retry.json();
            if (!retry.ok) {
              throw new Error(retryPayload?.error ?? "Request failed");
            }
            await load();
            return;
          }
          throw new Error(payload?.error ?? "Request failed");
        }
        await load();
      } catch (error: unknown) {
        console.error("UPDATE ERROR:", error);
        alert("ERROR: " + getErrorMessage(error, "Unknown error"));
        await load();
      }
    },
    [handleExpiredSession, load, refreshSession, token]
  );

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={updateBaristaAvatar}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "1px solid #333",
            background: "#111",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            padding: 0,
          }}
        >
          {baristaAvatar ? (
            <Image
              src={baristaAvatar}
              alt="avatar"
              width={48}
              height={48}
              style={{ objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontWeight: 700 }}>{baristaName.slice(0, 1).toUpperCase()}</span>
          )}
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Barista orders</h1>
          <div style={{ marginTop: 6 }}>
            <Link href="/admin" style={{ textDecoration: "none", color: "#555" }}>
              Manage products
            </Link>
          </div>
          <input
            value={baristaName}
            onChange={(event) => updateBaristaName(event.target.value)}
            placeholder="Your name"
            style={{
              marginTop: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "white",
            }}
          />
        </div>
      </div>
      <p style={{ opacity: 0.7 }}>Orders fetched from backend API</p>

      {!token ? (
        <div style={{ display: "grid", gap: 8, maxWidth: 360, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setAuthMode("login")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: authMode === "login" ? "#111" : "#f2f2f2",
                color: authMode === "login" ? "white" : "#111"
              }}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode("register")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: authMode === "register" ? "#111" : "#f2f2f2",
                color: authMode === "register" ? "white" : "#111"
              }}
            >
              Register barista
            </button>
          </div>

          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />

          {authMode === "register" && (
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Invite code"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          )}

          <button
            onClick={authMode === "login" ? handleLogin : handleRegister}
            disabled={authLoading}
          >
            {authLoading
              ? "Подождите..."
              : authMode === "login"
                ? "Login"
                : "Create barista"}
          </button>
        </div>
      ) : (
        <button onClick={handleLogout} style={{ marginTop: 12 }}>
          Logout
        </button>
      )}

  {token && isBarista === false && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2b100",
            background: "#fff7d1",
            color: "#5f4b00",
            maxWidth: 420,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Ваш аккаунт не имеет доступа бариста
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Введите код приглашения, чтобы видеть все заказы.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Invite code"
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
            <button onClick={handleGrantAccess} disabled={accessLoading}>
              {accessLoading ? "Проверяем..." : "Подтвердить доступ"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : !token ? (
        <p style={{ opacity: 0.7 }}>Login to view orders.</p>
      ) : orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setOrdersTab("active")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: ordersTab === "active" ? "#111" : "#f2f2f2",
                color: ordersTab === "active" ? "white" : "#111"
              }}
            >
              Active
            </button>
            <button
              onClick={() => setOrdersTab("history")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: ordersTab === "history" ? "#111" : "#f2f2f2",
                color: ordersTab === "history" ? "white" : "#111"
              }}
            >
              History
            </button>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {orders
              .filter((order) =>
                ordersTab === "history" ? order.status === "picked_up" : order.status !== "picked_up"
              )
              .map((o) => (
            <div
              key={o.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {o.customer_avatar ? (
                  <Image
                    src={o.customer_avatar}
                    alt={o.customer_name}
                    width={36}
                    height={36}
                    unoptimized
                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#111",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {o.customer_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ fontWeight: 700 }}>{o.customer_name}</div>
              </div>
              <div>Pickup: {new Date(o.pickup_time).toLocaleString()}</div>
              {o.order_items && o.order_items.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>Items:</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {o.order_items.map((item, index) => (
                      <li key={`${o.id}-item-${index}`}>
                        {item.quantity} × {item.name} ({item.size})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>Status: {o.status}</div>
              {ordersTab === "active" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setStatus(o.id, "accepted")}>
                    Accept
                  </button>
                  <button onClick={() => setStatus(o.id, "ready")}>
                    Ready
                  </button>
                  <button onClick={() => setStatus(o.id, "picked_up")}>
                    Picked up
                  </button>
                </div>
              )}
              <div style={{ opacity: 0.6, fontSize: 12 }}>{o.id}</div>
            </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

