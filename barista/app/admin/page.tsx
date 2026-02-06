"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { API_URL } from "../../lib/api";

const categories = ["coffee", "dessert"] as const;

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  category: (typeof categories)[number];
  description?: string | null;
  rating?: number | null;
  is_active?: boolean | null;
  is_popular?: boolean | null;
  size_price_modifiers?: {
    Small?: number;
    Medium?: number;
    Large?: number;
  } | null;
  created_at?: string;
};

type ProductForm = {
  name: string;
  price: string;
  image: string;
  category: Product["category"];
  description: string;
  rating: string;
  is_active: boolean;
  is_popular: boolean;
  sizeSmallPercent: string;
  sizeMediumPercent: string;
  sizeLargePercent: string;
};

const emptyForm: ProductForm = {
  name: "",
  price: "",
  image: "",
  category: "coffee",
  description: "",
  rating: "",
  is_active: true,
  is_popular: false,
  sizeSmallPercent: "",
  sizeMediumPercent: "",
  sizeLargePercent: "",
};

export default function AdminProductsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | Product["category"]>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "hidden">("all");
  const [filterPopular, setFilterPopular] = useState<"all" | "popular">("all");
  const [page, setPage] = useState(1);
  const refreshTokenKey = "refresh_token";
  const pageSize = 8;

  const getStoredRefreshToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(refreshTokenKey);
  }, [refreshTokenKey]);

  const refreshSession = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
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
    return accessToken;
  }, [getStoredRefreshToken, refreshTokenKey]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    setToken(stored);
    if (!stored) {
      refreshSession();
    }
  }, [refreshSession]);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/products`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (refreshed) {
            return await loadProducts();
          }
        }
        throw new Error(payload?.error ?? "Request failed");
      }
      setProducts(payload as Product[]);
    } catch (error) {
      console.error("Failed to load products", error);
    } finally {
      setLoading(false);
    }
  }, [refreshSession, token]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
  }, []);

  const parsedPayload = useMemo(() => {
    const price = Number(form.price);
    const rating = form.rating ? Number(form.rating) : undefined;
    const parsePercent = (value: string) => {
      if (!value.trim()) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const rawModifiers = {
      Small: parsePercent(form.sizeSmallPercent),
      Medium: parsePercent(form.sizeMediumPercent),
      Large: parsePercent(form.sizeLargePercent),
    };
    const size_price_modifiers = Object.fromEntries(
      Object.entries(rawModifiers).filter(([, value]) => value !== undefined)
    );
    const hasModifiers = Object.keys(size_price_modifiers).length > 0;
    return {
      name: form.name.trim(),
      price: Number.isFinite(price) ? price : 0,
      image: form.image.trim(),
      category: form.category,
      description: form.description.trim() || null,
      rating: rating && Number.isFinite(rating) ? rating : null,
      is_active: form.is_active,
      is_popular: form.is_popular,
      size_price_modifiers: hasModifiers ? size_price_modifiers : null,
    };
  }, [form]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);
      const matchesCategory = filterCategory === "all" || product.category === filterCategory;
      const matchesActive =
        filterActive === "all" ||
        (filterActive === "active" ? product.is_active !== false : product.is_active === false);
      const matchesPopular = filterPopular === "all" || product.is_popular === true;
      return matchesQuery && matchesCategory && matchesActive && matchesPopular;
    });
  }, [filterActive, filterCategory, filterPopular, products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const pagedProducts = useMemo(
    () => filteredProducts.slice((page - 1) * pageSize, page * pageSize),
    [filteredProducts, page]
  );

  const handleSubmit = useCallback(async () => {
    if (!token) {
      alert("Login first.");
      return;
    }
    if (!parsedPayload.name || !parsedPayload.image || !parsedPayload.price) {
      alert("Name, image, and price are required.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        editingId ? `${API_URL}/products/${editingId}` : `${API_URL}/products`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(parsedPayload),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        if (payload?.error === "Invalid or expired token") {
          const refreshed = await refreshSession();
          if (refreshed) {
            return await handleSubmit();
          }
        }
        throw new Error(payload?.error ?? "Request failed");
      }

      resetForm();
      await loadProducts();
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Request failed"));
    } finally {
      setSaving(false);
    }
  }, [editingId, loadProducts, parsedPayload, refreshSession, resetForm, token]);

  const handleEdit = useCallback((product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      price: String(product.price),
      image: product.image,
      category: product.category,
      description: product.description ?? "",
      rating: product.rating ? String(product.rating) : "",
      is_active: product.is_active ?? true,
      is_popular: product.is_popular ?? false,
      sizeSmallPercent:
        product.size_price_modifiers?.Small !== undefined
          ? String(product.size_price_modifiers.Small)
          : "",
      sizeMediumPercent:
        product.size_price_modifiers?.Medium !== undefined
          ? String(product.size_price_modifiers.Medium)
          : "",
      sizeLargePercent:
        product.size_price_modifiers?.Large !== undefined
          ? String(product.size_price_modifiers.Large)
          : "",
    });
  }, []);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;

  const image = document.createElement("img");
  image.onload = () => {
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / image.width);
        const targetWidth = Math.round(image.width * scale);
        const targetHeight = Math.round(image.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        setForm((prev) => ({ ...prev, image: compressed }));
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDelete = useCallback(
    async (product: Product) => {
      if (!token) {
        alert("Login first.");
        return;
      }
      if (!confirm(`Delete ${product.name}?`)) return;

      try {
        const response = await fetch(`${API_URL}/products/${product.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload?.error === "Invalid or expired token") {
            const refreshed = await refreshSession();
            if (refreshed) {
              return await handleDelete(product);
            }
          }
          throw new Error(payload?.error ?? "Request failed");
        }
        await loadProducts();
      } catch (error: unknown) {
        alert(getErrorMessage(error, "Request failed"));
      }
    },
    [loadProducts, refreshSession, token]
  );

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <Link href="/" style={{ textDecoration: "none", color: "#333" }}>
        ← Back to orders
      </Link>
      <h1 style={{ marginTop: 16 }}>Products admin</h1>
      <p style={{ opacity: 0.7 }}>Manage the coffee & dessert catalog.</p>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <section
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            display: "grid",
            gap: 12,
            minWidth: 280,
            flex: "1 1 320px",
            background: "#0f0f0f",
            color: "white",
          }}
        >
          <div style={{ fontWeight: 700 }}>{editingId ? "Edit product" : "Add new product"}</div>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Name"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input
            value={form.image}
            onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
            placeholder="Image URL"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input type="file" accept="image/*" onChange={handleImageUpload} />
          <input
            value={form.price}
            onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
            placeholder="Price"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <select
            value={form.category}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, category: event.target.value as Product["category"] }))
            }
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            value={form.rating}
            onChange={(event) => setForm((prev) => ({ ...prev, rating: event.target.value }))}
            placeholder="Rating (0-5)"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Size price % (relative to base/Medium). Use negatives for discounts.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
              gap: 8,
            }}
          >
            <input
              value={form.sizeSmallPercent}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sizeSmallPercent: event.target.value }))
              }
              placeholder="Small %"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
            <input
              value={form.sizeMediumPercent}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sizeMediumPercent: event.target.value }))
              }
              placeholder="Medium %"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
            <input
              value={form.sizeLargePercent}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sizeLargePercent: event.target.value }))
              }
              placeholder="Large %"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          </div>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
            rows={3}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            Active
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.is_popular}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, is_popular: event.target.checked }))
              }
            />
            Popular
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#1f2937",
                color: "white",
                fontWeight: 600,
              }}
            >
              {saving ? "Saving..." : editingId ? "Update product" : "Create product"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "transparent",
                  color: "white",
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Tip: upload or paste an image URL. Images are stored as data URLs in Supabase.
          </div>
        </section>

        <section
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            minWidth: 260,
            flex: "1 1 260px",
            background: "#0f0f0f",
            color: "white",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #222",
              background: "#0b0b0b",
            }}
          >
            {form.image ? (
              <Image
                src={form.image}
                alt={form.name}
                width={520}
                height={160}
                unoptimized
                style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  height: 160,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ opacity: 0.6 }}>Preview image</span>
              </div>
            )}
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{form.name || "Product name"}</div>
              <div style={{ opacity: 0.7 }}>${form.price || "0.00"}</div>
              {(form.sizeSmallPercent || form.sizeMediumPercent || form.sizeLargePercent) && (
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  Sizes: S {form.sizeSmallPercent || "0"}% · M {form.sizeMediumPercent || "0"}% ·
                  L {form.sizeLargePercent || "0"}%
                </div>
              )}
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {form.category} · {form.is_active ? "Active" : "Hidden"}
                {form.is_popular ? " · Popular" : ""}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Catalog</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <select
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value as typeof filterCategory)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={(event) => setFilterActive(event.target.value as typeof filterActive)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
          <select
            value={filterPopular}
            onChange={(event) => setFilterPopular(event.target.value as typeof filterPopular)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="all">All</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : pagedProducts.length === 0 ? (
          <p>No products yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {pagedProducts.map((product) => (
              <div
                key={product.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700 }}>{product.name}</div>
                <div style={{ opacity: 0.7 }}>${product.price.toFixed(2)}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {product.category} · {product.is_active ? "Active" : "Hidden"} ·
                  {product.is_popular ? " Popular" : ""}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleEdit(product)}>Edit</button>
                  <button onClick={() => handleDelete(product)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
            Prev
          </button>
          <div style={{ paddingTop: 6 }}>
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
