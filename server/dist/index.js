import express from "express";
import cors from "cors";
import { z } from "zod";
import { supabase } from "./supabase.js";
const app = express();
app.use(cors());
app.use(express.json());
const port = Number(process.env.PORT ?? 4000);
const baristaEmails = new Set((process.env.BARISTA_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
const baristaInviteCode = process.env.BARISTA_INVITE_CODE ?? "";
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.get("/orders/slot-availability", async (req, res) => {
    const pickupTime = typeof req.query.pickup_time === "string" ? req.query.pickup_time : "";
    const parsedPickup = new Date(pickupTime);
    if (!pickupTime || Number.isNaN(parsedPickup.getTime())) {
        return res.status(400).json({ error: "Invalid pickup_time" });
    }
    const slotMs = SLOT_MINUTES * 60 * 1000;
    const slotStart = new Date(Math.floor(parsedPickup.getTime() / slotMs) * slotMs);
    const slotEnd = new Date(slotStart.getTime() + slotMs);
    const productMap = await loadProductCategoryMap();
    const { data: slotOrders, error: slotError } = await supabase
        .from("orders")
        .select("total_items, order_items")
        .gte("pickup_time", slotStart.toISOString())
        .lt("pickup_time", slotEnd.toISOString());
    if (slotError) {
        return res.status(500).json({ error: slotError.message });
    }
    const slotItems = (slotOrders ?? []).reduce((sum, order) => {
        return sum + countCoffeeItems(order?.order_items, order?.total_items, productMap);
    }, 0);
    const remaining = Math.max(0, SLOT_LIMIT_ITEMS - slotItems);
    return res.json({
        slotStart: slotStart.toISOString(),
        slotEnd: slotEnd.toISOString(),
        remaining,
        limit: SLOT_LIMIT_ITEMS
    });
});
app.post("/auth/signup", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { email, password } = parsed.data;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    return res.json({
        user: data.user,
        session: data.session,
        isBarista: await isBaristaEmail(data.user?.email?.toLowerCase() ?? null)
    });
});
app.post("/auth/login", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { email, password } = parsed.data;
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) {
        return res.status(401).json({ error: error.message });
    }
    return res.json({
        user: data.user,
        session: data.session,
        isBarista: await isBaristaEmail(data.user?.email?.toLowerCase() ?? null)
    });
});
app.post("/auth/refresh", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { refreshToken } = parsed.data;
    const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
    });
    if (error) {
        return res.status(401).json({ error: error.message });
    }
    return res.json({
        user: data.user,
        session: data.session,
        isBarista: await isBaristaEmail(data.user?.email?.toLowerCase() ?? null)
    });
});
app.get("/auth/me", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    return res.json({
        user: { id: context.userId, email: context.email },
        isBarista: context.isBarista
    });
});
app.post("/auth/barista-signup", async (req, res) => {
    const parsed = baristaSignupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { email, password, inviteCode } = parsed.data;
    if (!baristaInviteCode || inviteCode !== baristaInviteCode) {
        return res.status(403).json({ error: "Invalid invite code" });
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    if (data.user?.email) {
        const { error: insertError } = await supabase
            .from("baristas")
            .upsert({ email: data.user.email.toLowerCase() }, { onConflict: "email" });
        if (insertError) {
            return res.status(500).json({ error: insertError.message });
        }
    }
    return res.json({ user: data.user, session: data.session, isBarista: true });
});
app.post("/auth/barista-grant", async (req, res) => {
    const parsed = baristaGrantSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: "Missing Authorization token" });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.email) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    const { inviteCode } = parsed.data;
    if (!baristaInviteCode || inviteCode !== baristaInviteCode) {
        return res.status(403).json({ error: "Invalid invite code" });
    }
    const email = userData.user.email.toLowerCase();
    const { error: insertError } = await supabase
        .from("baristas")
        .upsert({ email }, { onConflict: "email" });
    if (insertError) {
        return res.status(500).json({ error: insertError.message });
    }
    return res.json({ ok: true, isBarista: true });
});
const createOrderSchema = z.object({
    customer_name: z.string().min(1),
    customer_avatar: z.string().min(1).optional().nullable(),
    pickup_time: z.string().min(1),
    total_items: z.number().int().min(1).optional().default(1),
    order_items: z
        .array(z.object({
        name: z.string().min(1),
        size: z.string().min(1),
        quantity: z.number().int().min(1)
    }))
        .optional()
        .default([])
});
const SLOT_MINUTES = 10;
const SLOT_LIMIT_ITEMS = 5;
const updateStatusSchema = z.object({
    status: z.string().min(1)
});
const authSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
});
const baristaSignupSchema = authSchema.extend({
    inviteCode: z.string().min(1)
});
const baristaGrantSchema = z.object({
    inviteCode: z.string().min(1)
});
const sizePriceModifiersSchema = z
    .object({
    Small: z.number().optional(),
    Medium: z.number().optional(),
    Large: z.number().optional()
})
    .partial();
const productSchema = z.object({
    name: z.string().min(1),
    price: z.number().positive(),
    image: z.string().min(1),
    category: z.enum(["coffee", "dessert"]),
    description: z.string().optional().nullable(),
    rating: z.number().min(0).max(5).optional().nullable(),
    is_active: z.boolean().optional().default(true),
    is_popular: z.boolean().optional().default(false),
    size_price_modifiers: sizePriceModifiersSchema.optional().nullable()
});
const productUpdateSchema = productSchema.partial();
const refreshSchema = z.object({
    refreshToken: z.string().min(1)
});
async function isBaristaEmail(email) {
    if (!email)
        return false;
    if (baristaEmails.has(email))
        return true;
    const { data, error } = await supabase
        .from("baristas")
        .select("email")
        .eq("email", email)
        .maybeSingle();
    if (error) {
        console.error("Failed to check barista email", error);
        return false;
    }
    return !!data;
}
async function getAuthContext(req, res) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: "Missing Authorization token" });
        return null;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return null;
    }
    const email = data.user.email?.toLowerCase() ?? null;
    const context = {
        userId: data.user.id,
        email,
        isBarista: await isBaristaEmail(email),
        token
    };
    return context;
}
async function getOptionalAuthContext(req, res) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token)
        return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return null;
    }
    const email = data.user.email?.toLowerCase() ?? null;
    return {
        userId: data.user.id,
        email,
        isBarista: await isBaristaEmail(email),
        token,
    };
}
async function loadProductCategoryMap() {
    const { data, error } = await supabase.from("products").select("name, category");
    if (error) {
        console.error("Failed to load product categories", error);
        return new Map();
    }
    return new Map((data ?? []).map((product) => [product.name.toLowerCase(), product.category]));
}
function countCoffeeItems(orderItems, totalItems, productMap) {
    if (!orderItems || orderItems.length === 0) {
        return totalItems ?? 1;
    }
    return orderItems.reduce((sum, item) => {
        const category = productMap.get(item.name.toLowerCase());
        if (category === "dessert")
            return sum;
        return sum + item.quantity;
    }, 0);
}
app.post("/orders", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { customer_name, customer_avatar, pickup_time, total_items, order_items } = parsed.data;
    const parsedPickup = new Date(pickup_time);
    if (Number.isNaN(parsedPickup.getTime())) {
        return res.status(400).json({ error: "Invalid pickup_time" });
    }
    const slotMs = SLOT_MINUTES * 60 * 1000;
    const slotStart = new Date(Math.floor(parsedPickup.getTime() / slotMs) * slotMs);
    const slotEnd = new Date(slotStart.getTime() + slotMs);
    const productMap = await loadProductCategoryMap();
    const { data: slotOrders, error: slotError } = await supabase
        .from("orders")
        .select("total_items, order_items")
        .gte("pickup_time", slotStart.toISOString())
        .lt("pickup_time", slotEnd.toISOString());
    if (slotError) {
        return res.status(500).json({ error: slotError.message });
    }
    const slotItems = (slotOrders ?? []).reduce((sum, order) => {
        return sum + countCoffeeItems(order?.order_items, order?.total_items, productMap);
    }, 0);
    const coffeeItems = countCoffeeItems(order_items, total_items, productMap);
    if (slotItems + coffeeItems > SLOT_LIMIT_ITEMS) {
        return res.status(409).json({
            error: `Pickup slot is full. Please choose another time.`
        });
    }
    const { data, error } = await supabase
        .from("orders")
        .insert({
        customer_name,
        customer_avatar: customer_avatar ?? null,
        pickup_time: parsedPickup.toISOString(),
        total_items,
        order_items,
        status: "new",
        user_id: context.userId
    })
        .select()
        .single();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
});
app.get("/orders", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    const rawIds = req.query.ids;
    const ids = typeof rawIds === "string" && rawIds.trim().length
        ? rawIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : null;
    let query = supabase.from("orders").select("*");
    if (!context.isBarista) {
        query = query.eq("user_id", context.userId);
    }
    if (ids && ids.length > 0) {
        query = query.in("id", ids).order("created_at", { ascending: false });
    }
    else {
        query = query.order("pickup_time", { ascending: true }).limit(50);
    }
    const { data, error } = await query;
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
});
app.patch("/orders/:id", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    if (!context.isBarista) {
        return res.status(403).json({ error: "Barista access only" });
    }
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { id } = req.params;
    const { status } = parsed.data;
    const { data, error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.json(data);
});
app.get("/products", async (req, res) => {
    const context = await getOptionalAuthContext(req, res);
    if (res.headersSent)
        return;
    const category = typeof req.query.category === "string" ? req.query.category : null;
    let query = supabase.from("products").select("*");
    if (!context?.isBarista) {
        query = query.eq("is_active", true);
    }
    if (category === "coffee" || category === "dessert") {
        query = query.eq("category", category);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
});
app.post("/products", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    if (!context.isBarista) {
        return res.status(403).json({ error: "Barista access only" });
    }
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { data, error } = await supabase
        .from("products")
        .insert(parsed.data)
        .select()
        .single();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
});
app.patch("/products/:id", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    if (!context.isBarista) {
        return res.status(403).json({ error: "Barista access only" });
    }
    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { id } = req.params;
    const { data, error } = await supabase
        .from("products")
        .update(parsed.data)
        .eq("id", id)
        .select()
        .single();
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.json(data);
});
app.delete("/products/:id", async (req, res) => {
    const context = await getAuthContext(req, res);
    if (!context)
        return;
    if (!context.isBarista) {
        return res.status(403).json({ error: "Barista access only" });
    }
    const { id } = req.params;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    return res.json({ ok: true });
});
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
