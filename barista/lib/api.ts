export const API_URL = (() => {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_API_URL env for barista app");
  }
  return value.replace(/\/$/, "");
})();
