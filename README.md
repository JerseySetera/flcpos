# Simple POS — Next.js + Supabase + Vercel

A small point-of-sale system designed for a single store/user account.

### Included
- Supabase email/password authentication
- Product management
- SKU, category, price and stock
- POS cart
- Cash / GCash / Card payment method
- Atomic checkout that prevents overselling
- Automatic stock deduction
- Sales history
- Responsive desktop/mobile layout
- No paid backend required; designed around Supabase's free database/API tier

## 1. Create the Supabase project

Create a Supabase project, open **SQL Editor**, and run:

`supabase/schema.sql`

Supabase's current JavaScript setup uses the project URL plus a publishable key in client-side code, with Row Level Security controlling database access. Do not put a Supabase secret/service-role key in the browser.

## 2. Create the first account

Run the app locally:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and create an account.

If email confirmation is enabled in Supabase Auth, confirm the email before signing in.

## 3. Add products

Sign in and open **Products**. Add your products, prices and opening stock.

You can also insert sample products from the Supabase SQL Editor:

```sql
insert into public.products(user_id,name,sku,price,stock,category)
values
(auth.uid(),'Sample Coffee','COF-001',95,20,'Drinks'),
(auth.uid(),'Iced Tea','TEA-001',75,20,'Drinks'),
(auth.uid(),'Chocolate Cake','CKE-001',150,10,'Food');
```

Run this while authenticated in the Supabase SQL editor only if your SQL editor session supports the user context; otherwise add products through the app.

## 4. Vercel deployment

Push this project to GitHub, import it into Vercel, then add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the values from the Supabase project **Connect** panel.

Then deploy.

## Security notes

- The browser only receives the public/publishable Supabase key.
- RLS restricts products and sales to the signed-in user's `auth.uid()`.
- Checkout runs in a database function so sale creation and stock deduction happen atomically.
- Never add `SUPABASE_SECRET_KEY`, `service_role`, database passwords, or other server secrets to `NEXT_PUBLIC_*` variables.
- This is an MVP POS. Before using it for a larger operation, add staff roles/permissions, audit logs, refunds/voids, receipt printing, tax rules, backups, and reporting.

## Tech

- Next.js
- React
- TypeScript
- Supabase Postgres + Auth
- Vercel
