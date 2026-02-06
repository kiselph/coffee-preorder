# Copilot instructions for Coffee Preorder

## Big picture
- Monorepo with three apps: `barista/` (Next.js App Router dashboard), `mobile/` (Expo + expo-router), and `server/` (Express API).
- Both clients call the API server via `API_URL`; the server owns Supabase access using a service-role key in `server/src/supabase.ts`.
- Barista access is controlled by `BARISTA_EMAILS` or the `baristas` table, with invite-code flows in `/auth/barista-*`.

## Key data flows (follow these file examples)
- Auth flows live in `barista/app/page.tsx` and mobile tabs (`mobile/app/(tabs)/index.tsx`, `history.tsx`, `cart.tsx`) and call `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/me`, `/auth/barista-signup`, `/auth/barista-grant`.
- Orders: mobile posts to `POST /orders` (see `mobile/app/(tabs)/cart.tsx`), barista reads/updates via `GET /orders` and `PATCH /orders/:id` (`barista/app/page.tsx`).
- Order history: mobile stores IDs in AsyncStorage under `order_ids` and reloads with `GET /orders?ids=...` (`mobile/app/(tabs)/history.tsx`).
- Products catalog: mobile reads `GET /products` (`mobile/app/(tabs)/index.tsx`), baristas manage via `POST/PATCH/DELETE /products` in the server.

## API surface (server `README.md` is authoritative)
- `GET /health`
- `POST /auth/signup`, `POST /auth/login`
- `POST /orders`, `GET /orders`, `PATCH /orders/:id` (requires `Authorization: Bearer <access_token>`)
- `GET /products`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`

## Environment/config conventions
- API base URL: `NEXT_PUBLIC_API_URL` for web (`barista/lib/api.ts`) and `EXPO_PUBLIC_API_URL` for mobile (`mobile/app.config.js` → `mobile/lib/api.ts`).
- Server env (`server/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `BARISTA_EMAILS`, `BARISTA_INVITE_CODE`, `PORT`.
- Mobile Supabase env (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) is only needed if you use `mobile/lib/supabase.ts`; restart Expo with cache when these change.

## Developer workflows
- `barista/`: `npm run dev`, `npm run build`, `npm run lint` (see `barista/package.json`).
- `mobile/`: `npm run start`, `npm run ios`, `npm run android`, `npm run web`, `npm run lint` (see `mobile/package.json`).
- `server/`: `npm run dev` (see `server/README.md`).

## Routing/UI + local state patterns
- Web uses App Router files in `barista/app/`; mobile routes come from `mobile/app/` and tabs are defined in `mobile/app/(tabs)/_layout.tsx`.
- Web stores `auth_token` + `refresh_token` in localStorage, while mobile uses AsyncStorage + SecureStore (`mobile/lib/auth.ts`).
- The barista dashboard polls for orders (see the 3s interval in `barista/app/page.tsx`) instead of realtime subscriptions.

## Data model assumptions (server README examples)
- `orders` table includes a `user_id` UUID to scope orders to customers.
- Barista approvals live in a `baristas` table when using invite-code registration.
- `products` table includes `is_active` and `is_popular` flags to control visibility.
