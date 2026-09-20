-- Simple POS database for Supabase
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_no text not null unique,
  total numeric(12,2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash','gcash','card')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists products_user_id_idx on public.products(user_id);
create index if not exists products_name_idx on public.products(name);
create index if not exists sales_user_id_created_idx on public.sales(user_id, created_at desc);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "Users manage their products" on public.products;
create policy "Users manage their products"
on public.products for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users read their sales" on public.sales;
create policy "Users read their sales"
on public.sales for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read their sale items" on public.sale_items;
create policy "Users read their sale items"
on public.sale_items for select
to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.user_id = auth.uid()
  )
);

-- Atomic checkout: creates the sale, validates stock, writes line items,
-- and decrements inventory in one database transaction.
create or replace function public.create_sale(
  sale_items jsonb,
  sale_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_receipt text;
  v_total numeric(12,2) := 0;
  item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_line numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if sale_payment_method not in ('cash','gcash','card') then
    raise exception 'Invalid payment method.';
  end if;

  if jsonb_typeof(sale_items) <> 'array' or jsonb_array_length(sale_items) = 0 then
    raise exception 'Cart is empty.';
  end if;

  -- Lock the selected products while the sale is being created.
  for item in select * from jsonb_array_elements(sale_items)
  loop
    v_qty := (item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity.';
    end if;

    select * into v_product
    from public.products
    where id = (item->>'product_id')::uuid
      and user_id = auth.uid()
      and active = true
    for update;

    if not found then
      raise exception 'Product not found.';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    v_total := v_total + (v_product.price * v_qty);
  end loop;

  v_receipt := 'R-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
               upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.sales(user_id, receipt_no, total, payment_method)
  values (auth.uid(), v_receipt, v_total, sale_payment_method)
  returning id into v_sale_id;

  for item in select * from jsonb_array_elements(sale_items)
  loop
    v_qty := (item->>'qty')::integer;

    select * into v_product
    from public.products
    where id = (item->>'product_id')::uuid
      and user_id = auth.uid()
      and active = true
    for update;

    v_line := v_product.price * v_qty;

    insert into public.sale_items(sale_id, product_id, qty, unit_price, line_total)
    values (v_sale_id, v_product.id, v_qty, v_product.price, v_line);

    update public.products
    set stock = stock - v_qty
    where id = v_product.id
      and user_id = auth.uid();
  end loop;

  return jsonb_build_object(
    'id', v_sale_id,
    'receipt_no', v_receipt,
    'total', v_total
  );
end;
$$;

revoke all on function public.create_sale(jsonb, text) from public;
grant execute on function public.create_sale(jsonb, text) to authenticated;

-- Optional starter products. These are inserted for the currently signed-in
-- user by running the separate snippet below after creating an account.
-- Example:
-- insert into public.products(user_id,name,sku,price,stock,category)
-- values (auth.uid(),'Sample Coffee','COF-001',95,20,'Drinks');
