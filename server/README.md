# Coffee Preorder Server

Simple Express backend that talks to Supabase with a service role key. Clients call this API instead of hitting Supabase directly.

## Endpoints
- `GET /health`
- `POST /auth/signup` — register user (email/password)
- `POST /auth/login` — login and return session token
- `POST /orders` — create order
- `GET /orders` — list orders (barista sees all, clients see their own)
- `GET /orders?ids=id1,id2` — list specific orders (filtered by user)
- `PATCH /orders/:id` — update status (barista only)
- `GET /products` — list products (public shows only active items)
- `POST /products` — create product (barista only)
- `PATCH /products/:id` — update product (barista only)
- `DELETE /products/:id` — delete product (barista only)

## Auth notes
- Every request to `/orders` must include `Authorization: Bearer <access_token>`.
- Barista access is determined by `BARISTA_EMAILS` in the server env.
- The `orders` table should include a `user_id` column (UUID) to link orders to users.

## Barista registration
- Web UI supports a separate barista registration flow using `POST /auth/barista-signup`.
- Set `BARISTA_INVITE_CODE` in the server env and provide it in the UI.
- Ensure there is a `baristas` table to store approved barista emails:

```sql
create table if not exists public.baristas (
	id uuid primary key default gen_random_uuid(),
	email text unique not null,
	created_at timestamptz not null default now()
);
```

## Products catalog (centralized menu)
Create a `products` table to manage menu items without changing the app code:

```sql
create table if not exists public.products (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	price numeric not null,
	image text not null,
	category text not null check (category in ('coffee', 'dessert')),
	description text,
	rating numeric,
	is_active boolean not null default true,
	is_popular boolean not null default false,
	created_at timestamptz not null default now()
);
```

Notes:
- `is_active=false` hides items from customers but keeps them in the admin list.
- `is_popular=true` makes items appear in the “Popular choices” carousel.

## Environment
Copy `.env.example` to `.env` and fill in your Supabase credentials.

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (keep on server only)

Optional:
- `BARISTA_EMAILS` (comma-separated list of barista emails)
- `BARISTA_INVITE_CODE` (required for barista signup)

Optional:
- `PORT` (default `4000`)

## Run locally
- `npm install`
- `npm run dev`
