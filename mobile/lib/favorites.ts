import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "./cart";

const FAVORITES_KEY = "favorite_products";

export async function getFavorites(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Product[];
  } catch {
    return [];
  }
}

export async function setFavorites(items: Product[]) {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}

export async function toggleFavorite(item: Product) {
  const items = await getFavorites();
  const exists = items.some((entry) => entry.id === item.id);
  const next = exists ? items.filter((entry) => entry.id !== item.id) : [item, ...items];
  await setFavorites(next);
  return next;
}

export async function removeFavorite(id: string) {
  const items = await getFavorites();
  const next = items.filter((entry) => entry.id !== id);
  await setFavorites(next);
  return next;
}

export async function isFavorite(id: string) {
  const items = await getFavorites();
  return items.some((entry) => entry.id === id);
}
