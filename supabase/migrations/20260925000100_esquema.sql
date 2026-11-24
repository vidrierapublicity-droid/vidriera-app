-- =====================================================================
-- Vidriera · migración 1 · esquema, seguridad y funciones
--
-- Qué crea:
--   · Tablas: perfiles, equipo de la plataforma (staff), cuentas y
--     miembros, páginas, bloques, productos, pedidos, contactos,
--     eventos de analítica, integraciones, secretos de cobro y auditoría.
--   · Row Level Security (RLS) en todas las tablas: cada usuario solo
--     ve y edita lo de sus cuentas, aunque manipule el navegador.
--   · Registro automático: al crearse un usuario en Supabase Auth se
--     crean su perfil, su cuenta (Pro de prueba 14 días) y su página.
--   · Funciones (RPC) para la página pública, el editor, las
--     estadísticas y el panel de administración.
--
-- Las contraseñas NO están acá: las guarda Supabase Auth (auth.users)
-- como hash bcrypt. Nadie puede leerlas, tampoco un administrador.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "Mika Cerámica!" -> "mikaceramica"
create or replace function public.slugify(p text)
returns text language sql immutable set search_path = '' as $$
  select left(
    regexp_replace(
      translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9._]+', '', 'g'),
    30);
$$;

-- Convierte texto a uuid sin fallar (null si no es un uuid)
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Límites de cada plan (null = sin límite)
create or replace function public.plan_limits(p_plan text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_plan
    when 'inicial' then '{"pages": 1, "products": 5, "stats_days": 7}'::jsonb
    when 'pro'     then '{"pages": 3, "products": null, "stats_days": 90}'::jsonb
    when 'negocio' then '{"pages": 10, "products": null, "stats_days": 365}'::jsonb
    else '{"pages": 1, "products": 5, "stats_days": 7}'::jsonb
  end;
$$;

create or replace function public.default_page_settings()
returns jsonb language sql immutable set search_path = '' as $$
  select '{
    "whatsapp": "",
    "cuotas": 3,
    "transferDiscount": 10,
    "shipping": {"on": true, "cost": 6500},
    "pickup": {"on": true, "address": "Coordinamos el punto de retiro"},
    "seoTitle": "",
    "seoDesc": "",
    "hideBrand": false,
    "timezone": "America/Argentina/Buenos_Aires"
  }'::jsonb;
$$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- Perfil público mínimo de cada usuario (1 a 1 con auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Equipo de la plataforma (vos y tu soporte). Solo se modifica desde el
-- servidor con la clave secreta o desde el SQL Editor.
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('superadmin', 'soporte')),
  created_at timestamptz not null default now()
);

-- Cuenta = el negocio que usa un plan. Tiene uno o más miembros.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  plan text not null default 'inicial' check (plan in ('inicial', 'pro', 'negocio')),
  trial_ends_at timestamptz,
  status text not null default 'activa' check (status in ('activa', 'suspendida')),
  suspended_reason text check (char_length(suspended_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id);

-- Links que nadie puede usar (chocan con rutas de la app o son marcas)
create table public.reserved_slugs (
  slug text primary key
);
insert into public.reserved_slugs (slug) values
  ('admin'), ('api'), ('app'), ('auth'), ('ayuda'), ('blog'), ('cuenta'), ('estado'), ('help'),
  ('ingresar'), ('login'), ('logout'), ('panel'), ('planes'), ('precios'), ('privacidad'),
  ('recuperar'), ('registro'), ('salir'), ('signup'), ('soporte'), ('static'), ('terminos'),
  ('vidriera'), ('www'), ('mail'), ('media'), ('assets'), ('favicon.ico'), ('robots.txt'), ('sitemap.xml'),
  ('icon.svg'), ('_next'), ('manifest.json')
on conflict do nothing;

-- Páginas públicas: vidriera.link/<slug>
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9._]{3,30}$'),
  name text not null default '' check (char_length(name) <= 60),
  bio text not null default '' check (char_length(bio) <= 160),
  location text not null default '' check (char_length(location) <= 60),
  avatar_path text,
  design jsonb not null default '{}'::jsonb check (octet_length(design::text) <= 20000),
  settings jsonb not null default '{}'::jsonb check (octet_length(settings::text) <= 20000),
  status text not null default 'borrador' check (status in ('borrador', 'publicada', 'suspendida')),
  moderation_note text check (char_length(moderation_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_account_idx on public.pages (account_id);

-- Bloques: enlace, productos, cobro rápido, formulario, redes, texto.
-- El contenido propio de cada tipo va en data (jsonb).
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null check (type in ('link', 'products', 'payment', 'form', 'social', 'text')),
  position int not null default 0,
  visible boolean not null default true,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blocks_page_idx on public.blocks (page_id, position);

-- Productos: filas propias porque tienen stock y aparecen en pedidos
create table public.products (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  block_id uuid references public.blocks (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price >= 0),
  stock int check (stock >= 0),                -- null = sin límite
  image_path text,
  illustration jsonb,                          -- {"kind": "mug", "color": "#8DB6A4"} si no hay foto
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_page_idx on public.products (page_id, position);
create index products_block_idx on public.products (block_id);

-- Pedidos y cobros
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  page_id uuid not null references public.pages (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'a_confirmar', 'pagado', 'entregado', 'cancelado')),
  payment_method text not null check (payment_method in ('mercadopago', 'stripe', 'transferencia', 'whatsapp')),
  delivery_method text not null default 'ninguna' check (delivery_method in ('envio', 'retiro', 'ninguna')),
  delivery_address text check (char_length(delivery_address) <= 200),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_contact text not null check (char_length(customer_contact) between 3 and 160),
  currency text not null default 'ARS',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  shipping numeric(12, 2) not null default 0 check (shipping >= 0),
  total numeric(12, 2) not null check (total >= 0),
  source text not null default 'directo',
  provider_payment_id text,
  provider_preference_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_page_idx on public.orders (page_id, created_at desc);
create index orders_account_idx on public.orders (account_id, created_at desc);
create unique index orders_provider_payment_uidx on public.orders (payment_method, provider_payment_id)
  where provider_payment_id is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  block_id uuid references public.blocks (id) on delete set null,
  kind text not null default 'producto' check (kind in ('producto', 'cobro')),
  name text not null check (char_length(name) between 1 and 120),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 99)
);
create index order_items_order_idx on public.order_items (order_id);

-- Contactos que llegan por formularios y avisos de stock
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  block_id uuid references public.blocks (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  form_label text not null check (char_length(form_label) <= 120),
  name text check (char_length(name) <= 120),
  email text check (char_length(email) <= 160),
  whatsapp text check (char_length(whatsapp) <= 40),
  message text check (char_length(message) <= 1000),
  source text not null default 'directo',
  status text not null default 'nuevo' check (status in ('nuevo', 'contactado')),
  created_at timestamptz not null default now()
);
create index leads_account_idx on public.leads (account_id, created_at desc);
create index leads_page_idx on public.leads (page_id, created_at desc);

-- Analítica anónima: sin IP ni datos personales. visitor_hash rota cada día.
create table public.events (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null check (type in ('page_view', 'click', 'view_item', 'add_to_cart', 'begin_checkout',
                                     'add_payment_info', 'contact', 'purchase', 'lead')),
  block_id uuid,
  product_id uuid,
  source text not null default 'directo',
  visitor_hash text,
  device text check (device in ('celular', 'computadora', 'tablet')),
  country text,
  region text,
  city text,
  value numeric(12, 2),
  created_at timestamptz not null default now()
);
create index events_page_time_idx on public.events (page_id, created_at);

-- Estado visible de las integraciones (sin secretos)
create table public.integrations (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  mercadopago_connected boolean not null default false,
  mercadopago_user_id text,
  stripe_connected boolean not null default false,
  transfer_enabled boolean not null default false,
  transfer_alias text check (char_length(transfer_alias) <= 60),
  transfer_holder text check (char_length(transfer_holder) <= 80),
  whatsapp_orders boolean not null default true,
  meta_pixel_id text check (meta_pixel_id ~ '^[0-9]{10,20}$'),
  ga4_id text check (ga4_id ~ '^G-[A-Z0-9]{4,20}$'),
  webhook_url text check (webhook_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

-- Tokens de Mercado Pago / Stripe. RLS sin políticas: el navegador no
-- puede leerlos nunca; solo el servidor con la clave secreta.
create table public.payment_secrets (
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('mercadopago', 'stripe')),
  access_token text not null,
  refresh_token text,
  public_key text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, provider)
);

-- Todo lo que hace el equipo de la plataforma queda registrado
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null check (target_type in ('user', 'account', 'page', 'order', 'lead', 'staff')),
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_type, target_id, created_at desc);
create index audit_log_time_idx on public.audit_log (created_at desc);

-- updated_at automático
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_updated before update on public.accounts for each row execute function public.set_updated_at();
create trigger pages_updated before update on public.pages for each row execute function public.set_updated_at();
create trigger blocks_updated before update on public.blocks for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create trigger integrations_updated before update on public.integrations for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Quién es quién (se usan en las políticas RLS)
-- ---------------------------------------------------------------------

-- ¿El usuario actual es del equipo de la plataforma?
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.role = 'superadmin');
$$;

-- ¿La operación viene del servidor con la clave secreta o de una migración?
-- (Es SECURITY INVOKER a propósito: current_user es el rol que llama.)
create or replace function public.is_backend()
returns boolean language sql stable set search_path = '' as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
      or coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
$$;

create or replace function public.is_member(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = (select auth.uid()));
$$;

create or replace function public.is_owner(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;

create or replace function public.can_edit_page(p_page uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pages p
    join public.account_members m on m.account_id = p.account_id
    where p.id = p_page and m.user_id = (select auth.uid()));
$$;

-- ¿Comparto alguna cuenta con esta persona? (para ver nombres del equipo)
create or replace function public.shares_account(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_members a
    join public.account_members b on a.account_id = b.account_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.reserved_slugs enable row level security;
alter table public.pages enable row level security;
alter table public.blocks enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
alter table public.integrations enable row level security;
alter table public.payment_secrets enable row level security;
alter table public.audit_log enable row level security;

-- Perfiles
create policy "ver perfiles propios, del equipo o como staff" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_account(id) or public.is_staff());
create policy "editar mi perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Staff: cada uno ve su propio rol; el staff ve a todo el staff
create policy "ver mi rol" on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- Cuentas
create policy "ver mis cuentas" on public.accounts
  for select to authenticated
  using (public.is_member(id) or public.is_staff());
create policy "renombrar mi cuenta" on public.accounts
  for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy "ver miembros de mis cuentas" on public.account_members
  for select to authenticated
  using (public.is_member(account_id) or public.is_staff());

-- Links reservados: lectura pública (el registro los consulta)
create policy "leer links reservados" on public.reserved_slugs
  for select to anon, authenticated using (true);

-- Páginas (la página pública se lee con get_public_page, no con esta tabla)
create policy "ver mis páginas" on public.pages
  for select to authenticated
  using (public.is_member(account_id) or public.is_staff());
create policy "editar mis páginas" on public.pages
  for update to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));
create policy "borrar mis páginas" on public.pages
  for delete to authenticated
  using (public.is_owner(account_id));

-- Bloques y productos
create policy "ver bloques" on public.blocks for select to authenticated
  using (public.can_edit_page(page_id) or public.is_staff());
create policy "crear bloques" on public.blocks for insert to authenticated
  with check (public.can_edit_page(page_id));
create policy "editar bloques" on public.blocks for update to authenticated
  using (public.can_edit_page(page_id)) with check (public.can_edit_page(page_id));
create policy "borrar bloques" on public.blocks for delete to authenticated
  using (public.can_edit_page(page_id));

create policy "ver productos" on public.products for select to authenticated
  using (public.can_edit_page(page_id) or public.is_staff());
create policy "crear productos" on public.products for insert to authenticated
  with check (public.can_edit_page(page_id));
create policy "editar productos" on public.products for update to authenticated
  using (public.can_edit_page(page_id)) with check (public.can_edit_page(page_id));
create policy "borrar productos" on public.products for delete to authenticated
  using (public.can_edit_page(page_id));

-- Pedidos: se crean desde el servidor (checkout); el dueño cambia el estado
create policy "ver pedidos" on public.orders for select to authenticated
  using (public.is_member(account_id) or public.is_staff());
create policy "cambiar estado de pedidos" on public.orders for update to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));
create policy "ver ítems de pedidos" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (public.is_member(o.account_id) or public.is_staff())));

-- Contactos: se crean desde el servidor (formularios públicos)
create policy "ver contactos" on public.leads for select to authenticated
  using (public.is_member(account_id) or public.is_staff());
create policy "marcar contactos" on public.leads for update to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));

-- Integraciones
create policy "ver integraciones" on public.integrations for select to authenticated
  using (public.is_member(account_id) or public.is_staff());
create policy "editar integraciones" on public.integrations for update to authenticated
  using (public.is_owner(account_id)) with check (public.is_owner(account_id));

-- Auditoría: solo el staff la lee
create policy "staff lee auditoría" on public.audit_log for select to authenticated
  using (public.is_staff());

-- events y payment_secrets: sin políticas => ningún acceso desde el navegador.

-- Permisos por columna: lo que un usuario puede cambiar y lo que no
revoke insert, update, delete on public.accounts from anon, authenticated;
grant update (name) on public.accounts to authenticated;

revoke insert, update, delete on public.account_members from anon, authenticated;
revoke insert, update, delete on public.staff from anon, authenticated;
revoke insert, update, delete on public.reserved_slugs from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_path) on public.profiles to authenticated;

revoke insert, update on public.pages from anon, authenticated;
grant update (slug, name, bio, location, avatar_path, design, settings, status) on public.pages to authenticated;

revoke insert, update, delete on public.orders from anon, authenticated;
grant update (status) on public.orders to authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

revoke insert, update, delete on public.leads from anon, authenticated;
grant update (status) on public.leads to authenticated;

revoke insert, update, delete on public.integrations from anon, authenticated;
grant update (transfer_enabled, transfer_alias, transfer_holder, whatsapp_orders, meta_pixel_id, ga4_id, webhook_url)
  on public.integrations to authenticated;

revoke all on public.events from anon, authenticated;
revoke all on public.payment_secrets from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on public.blocks, public.products from anon;

-- ---------------------------------------------------------------------
-- 5. Reglas que no dependen de la interfaz
-- ---------------------------------------------------------------------

-- Páginas: links reservados, suspensiones y cuentas suspendidas
-- Solo el servidor (clave secreta) saltea estas reglas. El staff modera
-- desde el panel de admin, que usa la clave secreta; con su propia sesión
-- tiene las mismas reglas que cualquier usuario.
create or replace function public.pages_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  privileged boolean := public.is_backend();
begin
  new.slug := lower(trim(new.slug));
  if privileged then
    return new;
  end if;
  if exists (select 1 from public.reserved_slugs r where r.slug = new.slug) then
    raise exception 'El link «%» está reservado. Probá con otro.', new.slug using errcode = '23514';
  end if;
  if exists (select 1 from public.accounts a where a.id = new.account_id and a.status = 'suspendida') then
    raise exception 'La cuenta está suspendida. Escribinos a soporte.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'suspendida' then
      raise exception 'Esta página está suspendida. Escribinos a soporte.' using errcode = '42501';
    end if;
    if new.status = 'suspendida' then
      raise exception 'Solo el equipo de Vidriera puede suspender páginas.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger pages_guard before insert or update on public.pages
  for each row execute function public.pages_guard();

-- Una página suspendida no se puede borrar: si no, el dueño podría
-- recrearla con el mismo link y esquivar la suspensión.
create or replace function public.pages_delete_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'suspendida' and not public.is_backend() then
    raise exception 'Esta página está suspendida. Escribinos a soporte.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger pages_delete_guard before delete on public.pages
  for each row execute function public.pages_delete_guard();

-- Límite de productos según el plan
create or replace function public.enforce_product_limit()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_account uuid;
  v_plan text;
  v_max int;
  v_count int;
begin
  select p.account_id, a.plan into v_account, v_plan
  from public.pages p join public.accounts a on a.id = p.account_id
  where p.id = new.page_id;
  v_max := (public.plan_limits(v_plan) ->> 'products')::int;
  if v_max is null then
    return new;
  end if;
  select count(*) into v_count
  from public.products x join public.pages p on p.id = x.page_id
  where p.account_id = v_account;
  if v_count >= v_max then
    raise exception 'Tu plan permite hasta % productos. Pasate a Pro para cargar más.', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger products_limit before insert on public.products
  for each row execute function public.enforce_product_limit();

-- Fecha de pago automática
create or replace function public.orders_paid_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'pagado' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end $$;
create trigger orders_paid_at before insert or update on public.orders
  for each row execute function public.orders_paid_at();

-- ---------------------------------------------------------------------
-- 6. Links y plantillas de página
-- ---------------------------------------------------------------------
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(p_slug) ~ '^[a-z0-9._]{3,30}$'
     and not exists (select 1 from public.pages where slug = lower(p_slug))
     and not exists (select 1 from public.reserved_slugs where slug = lower(p_slug));
$$;

-- Primer link libre a partir del deseado o del nombre ("mika" -> "mika482")
create or replace function public.free_slug(p_wanted text, p_name text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  tries int := 0;
begin
  base := public.slugify(coalesce(nullif(p_wanted, ''), p_name));
  if char_length(base) < 3 then
    base := base || 'tienda';
  end if;
  base := left(base, 26);
  candidate := base;
  loop
    exit when public.slug_available(candidate);
    tries := tries + 1;
    if tries > 40 then
      candidate := 'pagina' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    else
      candidate := base || (floor(random() * 900 + 100))::int::text;
    end if;
  end loop;
  return candidate;
end $$;

-- Crea una página con bloques de ejemplo según el objetivo elegido
create or replace function public.create_page_from_template(
  p_account uuid, p_slug text, p_name text, p_goal text, p_theme text, p_publish boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_page uuid;
  v_block uuid;
  v_slug text := p_slug;
  v_try int := 0;
  v_pos int := 0;
  v_goal text := case when p_goal in ('productos', 'servicios', 'contenido', 'todo') then p_goal else 'todo' end;
  v_theme text := case when p_theme in ('vidrio', 'pizarra', 'esmalte', 'cartel', 'terracota', 'noche') then p_theme else 'vidrio' end;
begin
  loop
    begin
      insert into public.pages (account_id, slug, name, bio, design, settings, status)
      values (
        p_account, v_slug, left(coalesce(nullif(trim(p_name), ''), 'Mi página'), 60),
        case v_goal
          when 'productos' then 'Contá en una línea qué vendés y por qué es especial.'
          when 'servicios' then 'Contá qué servicio ofrecés, dónde y para quién.'
          when 'contenido' then 'Contá de qué hablás y dónde encontrarte.'
          else 'Contá en una línea qué hacés.'
        end,
        jsonb_build_object('theme', v_theme),
        public.default_page_settings(),
        case when p_publish then 'publicada' else 'borrador' end)
      returning id into v_page;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then
        raise;
      end if;
      v_slug := public.free_slug(p_slug, p_name);
    end;
  end loop;

  insert into public.blocks (page_id, type, position, data) values (v_page, 'social', v_pos,
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('net', 'instagram', 'handle', v_slug),
      jsonb_build_object('net', 'whatsapp', 'handle', ''))));
  v_pos := v_pos + 1;

  if v_goal in ('productos', 'todo') then
    insert into public.blocks (page_id, type, position, data) values (v_page, 'link', v_pos,
      '{"title": "Novedades de la semana", "url": "", "featured": true}'::jsonb);
    v_pos := v_pos + 1;
    insert into public.blocks (page_id, type, position, data) values (v_page, 'products', v_pos,
      '{"title": "Tienda", "layout": "grid"}'::jsonb) returning id into v_block;
    v_pos := v_pos + 1;
    insert into public.products (page_id, block_id, name, description, price, compare_at_price, stock, illustration, position) values
      (v_page, v_block, 'Producto estrella', 'Contá de qué está hecho, medidas y cómo se usa.', 15000, null, 10, '{"kind": "bag", "color": "#FF8A5B"}', 0),
      (v_page, v_block, 'Combo x2', 'Dos unidades con precio especial.', 27000, 30000, 5, '{"kind": "box", "color": "#E2B872"}', 1);
    if v_goal = 'productos' then
      insert into public.products (page_id, block_id, name, description, price, stock, illustration, position) values
        (v_page, v_block, 'Gift card', 'Para regalar. Se envía por mail.', 10000, 50, '{"kind": "gift", "color": "#8FA8E8"}', 2);
    end if;
  end if;

  if v_goal in ('servicios', 'todo') then
    insert into public.blocks (page_id, type, position, data) values (v_page, 'payment', v_pos,
      jsonb_build_object('title', case when v_goal = 'servicios' then 'Reservá tu turno con seña' else 'Seña para pedidos a medida' end,
        'desc', 'Pagás la seña ahora y el resto el día del servicio.', 'mode', 'fixed', 'amount', 5000,
        'suggested', jsonb_build_array(2000, 5000, 10000), 'button', 'Pagar seña'));
    v_pos := v_pos + 1;
    insert into public.blocks (page_id, type, position, data) values (v_page, 'form', v_pos,
      jsonb_build_object('kind', 'contacto', 'title', case when v_goal = 'servicios' then 'Pedí tu turno' else 'Escribime' end,
        'desc', 'Contame qué necesitás y te respondo en el día.',
        'fields', '{"name": true, "email": false, "whatsapp": true, "message": true}'::jsonb,
        'button', 'Enviar', 'thanks', '¡Gracias! Te escribo por WhatsApp.'));
    v_pos := v_pos + 1;
  end if;

  if v_goal = 'contenido' then
    insert into public.blocks (page_id, type, position, data) values
      (v_page, 'link', v_pos, '{"title": "Mi último video", "url": "", "featured": true}'::jsonb),
      (v_page, 'link', v_pos + 1, '{"title": "Mis recomendaciones", "url": "", "featured": false}'::jsonb),
      (v_page, 'payment', v_pos + 2, '{"title": "Invitame un café", "desc": "Si te sirve lo que hago, podés bancarme con lo que quieras.", "mode": "free", "amount": 2500, "suggested": [1000, 2500, 5000], "button": "Invitar"}'::jsonb),
      (v_page, 'form', v_pos + 3, '{"kind": "newsletter", "title": "Suscribite a mi newsletter", "desc": "Un mail por semana. Te das de baja cuando quieras.", "fields": {"name": false, "email": true, "whatsapp": false, "message": false}, "button": "Suscribirme", "thanks": "¡Listo! Revisá tu correo."}'::jsonb);
    v_pos := v_pos + 4;
  end if;

  if v_goal = 'productos' then
    insert into public.blocks (page_id, type, position, data) values (v_page, 'form', v_pos,
      '{"kind": "lista", "title": "Enterate primero de los lanzamientos", "desc": "", "fields": {"name": false, "email": true, "whatsapp": false, "message": false}, "button": "Avisame", "thanks": "Listo, te avisamos."}'::jsonb);
    v_pos := v_pos + 1;
  end if;

  insert into public.blocks (page_id, type, position, data) values (v_page, 'text', v_pos,
    jsonb_build_object('title', '', 'text', case v_goal
      when 'servicios' then 'Atiendo de lunes a sábado. Escribime para consultar disponibilidad.'
      when 'contenido' then 'Para colaboraciones escribime por WhatsApp.'
      else 'Envíos a todo el país. Consultá por WhatsApp.' end));

  return v_page;
end $$;

-- ---------------------------------------------------------------------
-- 7. Registro: al crearse un usuario en Supabase Auth
-- ---------------------------------------------------------------------
-- El formulario de registro manda en options.data:
--   full_name, page_name, slug, goal, theme
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := left(coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'Usuario'), 80);
  v_brand text := left(coalesce(nullif(trim(meta ->> 'page_name'), ''), v_name), 60);
  v_account uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, v_name);

  insert into public.accounts (name, plan, trial_ends_at, created_by)
  values (left(coalesce(nullif(v_brand, ''), 'Mi cuenta'), 80), 'pro', now() + interval '14 days', new.id)
  returning id into v_account;

  insert into public.account_members (account_id, user_id, role) values (v_account, new.id, 'owner');
  insert into public.integrations (account_id) values (v_account);

  perform public.create_page_from_template(
    v_account,
    public.free_slug(meta ->> 'slug', v_brand),
    v_brand,
    meta ->> 'goal',
    meta ->> 'theme',
    new.email_confirmed_at is not null);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Al confirmar el email se publican las páginas creadas en el registro
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.pages p set status = 'publicada'
    where p.status = 'borrador'
      and p.created_at > now() - interval '30 days'
      and p.account_id in (select a.id from public.accounts a where a.created_by = new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- ---------------------------------------------------------------------
-- 8. Funciones para la app
-- ---------------------------------------------------------------------

-- Página pública: solo lo que se puede mostrar a cualquiera
create or replace function public.get_public_page(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'page', jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'bio', p.bio, 'location', p.location,
      'avatar_path', p.avatar_path, 'design', p.design, 'settings', p.settings, 'plan', a.plan),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'type', b.type, 'data', b.data) order by b.position)
      from public.blocks b
      where b.page_id = p.id and b.visible
        and (b.starts_at is null or b.starts_at <= now())
        and (b.ends_at is null or b.ends_at >= now())), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'block_id', x.block_id, 'name', x.name, 'description', x.description,
        'price', x.price, 'compare_at_price', x.compare_at_price, 'stock', x.stock,
        'image_path', x.image_path, 'illustration', x.illustration) order by x.position)
      from public.products x
      where x.page_id = p.id and x.active), '[]'::jsonb),
    'integrations', jsonb_build_object(
      'mercadopago', coalesce(i.mercadopago_connected, false),
      'stripe', coalesce(i.stripe_connected, false),
      'transfer', coalesce(i.transfer_enabled and i.transfer_alias is not null, false),
      'whatsapp_orders', coalesce(i.whatsapp_orders, true),
      'meta_pixel_id', i.meta_pixel_id,
      'ga4_id', i.ga4_id))
  from public.pages p
  join public.accounts a on a.id = p.account_id
  left join public.integrations i on i.account_id = p.account_id
  where p.slug = lower(p_slug) and p.status = 'publicada' and a.status = 'activa';
$$;

-- Documento completo de una página para el editor (respeta RLS)
create or replace function public.get_page_doc(p_page uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'account_id', p.account_id, 'slug', p.slug, 'name', p.name, 'bio', p.bio,
    'location', p.location, 'avatar_path', p.avatar_path, 'design', p.design,
    'settings', p.settings, 'status', p.status, 'updated_at', p.updated_at,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'type', b.type, 'visible', b.visible, 'data', b.data,
        'starts_at', b.starts_at, 'ends_at', b.ends_at,
        'products', case when b.type = 'products' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', x.id, 'name', x.name, 'description', x.description, 'price', x.price,
            'compare_at_price', x.compare_at_price, 'stock', x.stock, 'image_path', x.image_path,
            'illustration', x.illustration, 'active', x.active) order by x.position)
          from public.products x where x.block_id = b.id), '[]'::jsonb) end)
        order by b.position)
      from public.blocks b where b.page_id = p.id), '[]'::jsonb))
  from public.pages p
  where p.id = p_page;
$$;

-- Guarda la página entera en una transacción: datos, bloques y productos.
-- Los ids nuevos pueden venir como texto temporal ("tmp_1"); se devuelve
-- el mapa {"tmp_1": "<uuid>"} para que el editor los reemplace.
create or replace function public.save_page(p_page uuid, p_doc jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_block jsonb;
  v_prod jsonb;
  v_bpos bigint;
  v_ppos bigint;
  v_bid uuid;
  v_pid uuid;
  v_keep_blocks uuid[] := '{}';
  v_keep_products uuid[] := '{}';
  v_ids jsonb := '{}'::jsonb;
begin
  if not (public.is_backend() or public.can_edit_page(p_page)) then
    raise exception 'No tenés permiso para editar esta página.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_doc -> 'blocks') is distinct from 'array' then
    raise exception 'Formato inválido: falta la lista de bloques.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_doc -> 'blocks') > 100 then
    raise exception 'Una página puede tener hasta 100 bloques.' using errcode = '22023';
  end if;

  update public.pages set
    name = coalesce(p_doc ->> 'name', name),
    bio = coalesce(p_doc ->> 'bio', bio),
    location = coalesce(p_doc ->> 'location', location),
    slug = coalesce(lower(p_doc ->> 'slug'), slug),
    avatar_path = case when p_doc ? 'avatar_path' then p_doc ->> 'avatar_path' else avatar_path end,
    design = coalesce(p_doc -> 'design', design),
    settings = coalesce(p_doc -> 'settings', settings)
  where id = p_page;

  for v_block, v_bpos in
    select e.value, e.ordinality - 1 from jsonb_array_elements(p_doc -> 'blocks') with ordinality as e
  loop
    v_bid := null;
    if coalesce(v_block ->> 'id', '') ~ uuid_re then
      select b.id into v_bid from public.blocks b where b.id = (v_block ->> 'id')::uuid and b.page_id = p_page;
    end if;
    if v_bid is null then
      insert into public.blocks (page_id, type, position, visible, data, starts_at, ends_at)
      values (p_page, v_block ->> 'type', v_bpos, coalesce((v_block ->> 'visible')::boolean, true),
              coalesce(v_block -> 'data', '{}'::jsonb),
              nullif(v_block ->> 'starts_at', '')::timestamptz, nullif(v_block ->> 'ends_at', '')::timestamptz)
      returning id into v_bid;
      if v_block ? 'id' then
        v_ids := v_ids || jsonb_build_object(v_block ->> 'id', v_bid);
      end if;
    else
      update public.blocks set
        type = v_block ->> 'type', position = v_bpos,
        visible = coalesce((v_block ->> 'visible')::boolean, true),
        data = coalesce(v_block -> 'data', '{}'::jsonb),
        starts_at = nullif(v_block ->> 'starts_at', '')::timestamptz,
        ends_at = nullif(v_block ->> 'ends_at', '')::timestamptz
      where id = v_bid;
    end if;
    v_keep_blocks := v_keep_blocks || v_bid;

    if v_block ->> 'type' = 'products' and jsonb_typeof(v_block -> 'products') = 'array' then
      for v_prod, v_ppos in
        select e.value, e.ordinality - 1 from jsonb_array_elements(v_block -> 'products') with ordinality as e
      loop
        v_pid := null;
        if coalesce(v_prod ->> 'id', '') ~ uuid_re then
          select x.id into v_pid from public.products x where x.id = (v_prod ->> 'id')::uuid and x.page_id = p_page;
        end if;
        if v_pid is null then
          insert into public.products (page_id, block_id, name, description, price, compare_at_price, stock,
                                       image_path, illustration, position, active)
          values (p_page, v_bid,
                  left(coalesce(nullif(trim(v_prod ->> 'name'), ''), 'Producto sin nombre'), 80),
                  left(coalesce(v_prod ->> 'description', ''), 500),
                  coalesce(nullif(v_prod ->> 'price', '')::numeric, 0),
                  nullif(nullif(v_prod ->> 'compare_at_price', '')::numeric, 0),
                  nullif(v_prod ->> 'stock', '')::int,
                  v_prod ->> 'image_path', v_prod -> 'illustration', v_ppos,
                  coalesce((v_prod ->> 'active')::boolean, true))
          returning id into v_pid;
          if v_prod ? 'id' then
            v_ids := v_ids || jsonb_build_object(v_prod ->> 'id', v_pid);
          end if;
        else
          update public.products set
            block_id = v_bid,
            name = left(coalesce(nullif(trim(v_prod ->> 'name'), ''), 'Producto sin nombre'), 80),
            description = left(coalesce(v_prod ->> 'description', ''), 500),
            price = coalesce(nullif(v_prod ->> 'price', '')::numeric, 0),
            compare_at_price = nullif(nullif(v_prod ->> 'compare_at_price', '')::numeric, 0),
            stock = nullif(v_prod ->> 'stock', '')::int,
            image_path = v_prod ->> 'image_path',
            illustration = v_prod -> 'illustration',
            position = v_ppos,
            active = coalesce((v_prod ->> 'active')::boolean, true)
          where id = v_pid;
        end if;
        v_keep_products := v_keep_products || v_pid;
      end loop;
    end if;
  end loop;

  delete from public.products where page_id = p_page and not (id = any (v_keep_products));
  delete from public.blocks where page_id = p_page and not (id = any (v_keep_blocks));

  return jsonb_build_object('page', public.get_page_doc(p_page), 'ids', v_ids);
end $$;

-- Crear otra página dentro de una cuenta (respeta el límite del plan)
create or replace function public.create_page(p_account uuid, p_slug text, p_name text, p_goal text default 'todo', p_theme text default 'vidrio')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_status text;
  v_max int;
  v_count int;
begin
  if not public.is_member(p_account) then
    raise exception 'No sos parte de esta cuenta.' using errcode = '42501';
  end if;
  select plan, status into v_plan, v_status from public.accounts where id = p_account;
  if v_status = 'suspendida' then
    raise exception 'La cuenta está suspendida.' using errcode = '42501';
  end if;
  v_max := (public.plan_limits(v_plan) ->> 'pages')::int;
  select count(*) into v_count from public.pages where account_id = p_account;
  if v_max is not null and v_count >= v_max then
    raise exception 'Tu plan permite hasta % páginas.', v_max using errcode = 'P0001';
  end if;
  if not public.slug_available(p_slug) then
    raise exception 'El link «%» no está disponible.', lower(p_slug) using errcode = '23505';
  end if;
  return public.create_page_from_template(p_account, lower(p_slug), p_name, p_goal, p_theme, true);
end $$;

-- Estadísticas de una página (dueños, miembros y staff)
create or replace function public.page_stats(p_page uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_plan text;
  v_days int;
  v_from timestamptz;
  v_prev timestamptz;
  v_result jsonb;
begin
  if not (public.can_edit_page(p_page) or public.is_staff()) then
    raise exception 'No tenés acceso a estas estadísticas.' using errcode = '42501';
  end if;
  select coalesce(nullif(p.settings ->> 'timezone', ''), 'America/Argentina/Buenos_Aires'), a.plan
    into v_tz, v_plan
  from public.pages p join public.accounts a on a.id = p.account_id
  where p.id = p_page;
  if v_plan is null then
    return null;
  end if;
  v_days := least(greatest(coalesce(p_days, 30), 1), coalesce((public.plan_limits(v_plan) ->> 'stats_days')::int, 365));
  v_from := (date_trunc('day', now() at time zone v_tz) - make_interval(days => v_days - 1)) at time zone v_tz;
  v_prev := v_from - make_interval(days => v_days);

  with ev as (
    select e.type, e.source, e.block_id, e.device, e.city, e.visitor_hash, e.created_at,
           (e.created_at at time zone v_tz) as local_ts
    from public.events e
    where e.page_id = p_page and e.created_at >= v_prev
  ),
  cur as (select * from ev where created_at >= v_from),
  prv as (select * from ev where created_at < v_from),
  ord as (
    select o.id, o.total, o.status, o.source, o.created_at, (o.created_at at time zone v_tz) as local_ts
    from public.orders o
    where o.page_id = p_page and o.created_at >= v_prev and o.status <> 'cancelado'
  ),
  ocur as (select * from ord where created_at >= v_from),
  oprv as (select * from ord where created_at < v_from),
  days as (
    select d::date as d
    from generate_series(date_trunc('day', v_from at time zone v_tz), date_trunc('day', now() at time zone v_tz), interval '1 day') as d
  )
  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'timezone', v_tz,
    'totals', jsonb_build_object(
      'visits', (select count(*) from cur where type = 'page_view'),
      'visitors', (select count(distinct visitor_hash) from cur where type = 'page_view'),
      'clicks', (select count(*) from cur where type in ('click', 'view_item')),
      'orders', (select count(*) from ocur),
      'revenue', (select coalesce(sum(total), 0) from ocur where status in ('pagado', 'entregado')),
      'leads', (select count(*) from public.leads l where l.page_id = p_page and l.created_at >= v_from)),
    'previous', jsonb_build_object(
      'visits', (select count(*) from prv where type = 'page_view'),
      'clicks', (select count(*) from prv where type in ('click', 'view_item')),
      'orders', (select count(*) from oprv),
      'revenue', (select coalesce(sum(total), 0) from oprv where status in ('pagado', 'entregado')),
      'leads', (select count(*) from public.leads l where l.page_id = p_page and l.created_at >= v_prev and l.created_at < v_from)),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', days.d,
        'visits', coalesce(e.visits, 0), 'clicks', coalesce(e.clicks, 0),
        'orders', coalesce(o.orders, 0), 'revenue', coalesce(o.revenue, 0)) order by days.d), '[]'::jsonb)
      from days
      left join (
        select local_ts::date as d,
               count(*) filter (where type = 'page_view') as visits,
               count(*) filter (where type in ('click', 'view_item')) as clicks
        from cur group by 1) e on e.d = days.d
      left join (
        select local_ts::date as d, count(*) as orders,
               coalesce(sum(total) filter (where status in ('pagado', 'entregado')), 0) as revenue
        from ocur group by 1) o on o.d = days.d),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'visits', s.visits,
                                                   'orders', coalesce(o.orders, 0), 'revenue', coalesce(o.revenue, 0))
                                order by s.visits desc), '[]'::jsonb)
      from (select source, count(*) as visits from cur where type = 'page_view' group by source) s
      left join (select source, count(*) as orders,
                        coalesce(sum(total) filter (where status in ('pagado', 'entregado')), 0) as revenue
                 from ocur group by source) o on o.source = s.source),
    'by_block', (
      select coalesce(jsonb_agg(jsonb_build_object('block_id', t.block_id, 'clicks', t.n) order by t.n desc), '[]'::jsonb)
      from (select block_id, count(*) as n from cur
            where type in ('click', 'view_item') and block_id is not null group by block_id) t),
    'funnel', jsonb_build_object(
      'visits', (select count(*) from cur where type = 'page_view'),
      'view_item', (select count(*) from cur where type = 'view_item'),
      'add_to_cart', (select count(*) from cur where type = 'add_to_cart'),
      'begin_checkout', (select count(*) from cur where type = 'begin_checkout'),
      'purchases', (select count(*) from ocur where exists (
        select 1 from public.order_items i where i.order_id = ocur.id and i.kind = 'producto'))),
    'heat', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', t.dow, 'hour', t.hr, 'visits', t.n)), '[]'::jsonb)
      from (select extract(isodow from local_ts)::int as dow, extract(hour from local_ts)::int as hr, count(*) as n
            from cur where type = 'page_view' group by 1, 2) t),
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('device', t.device, 'visits', t.n) order by t.n desc), '[]'::jsonb)
      from (select coalesce(device, 'celular') as device, count(*) as n from cur where type = 'page_view' group by 1) t),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', t.city, 'visits', t.n) order by t.n desc), '[]'::jsonb)
      from (select city, count(*) as n from cur where type = 'page_view' and city is not null
            group by city order by count(*) desc limit 8) t)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- 9. Administración (solo staff; se verifica adentro de cada función)
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Solo para el equipo de Vidriera.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'pages_published', (select count(*) from public.pages where status = 'publicada'),
    'pages_suspended', (select count(*) from public.pages where status = 'suspendida'),
    'accounts_suspended', (select count(*) from public.accounts where status = 'suspendida'),
    'plans', coalesce((select jsonb_object_agg(plan, n) from (select plan, count(*) as n from public.accounts group by plan) t), '{}'::jsonb),
    'trials_active', (select count(*) from public.accounts where trial_ends_at > now()),
    'orders_30d', (select count(*) from public.orders where created_at > now() - interval '30 days' and status <> 'cancelado'),
    'gmv_30d', (select coalesce(sum(total), 0) from public.orders where created_at > now() - interval '30 days' and status in ('pagado', 'entregado')),
    'visits_30d', (select count(*) from public.events where type = 'page_view' and created_at > now() - interval '30 days'),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.d, 'users', coalesce(s.n, 0)) order by d.d), '[]'::jsonb)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as d) d
      left join (select created_at::date as d, count(*) as n from auth.users
                 where created_at > now() - interval '31 days' group by 1) s on s.d = d.d),
    'recent_users', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (select u.id, u.email, u.created_at, pr.full_name,
                   (select pg.slug from public.pages pg join public.account_members m on m.account_id = pg.account_id
                    where m.user_id = u.id order by pg.created_at limit 1) as slug
            from auth.users u left join public.profiles pr on pr.id = u.id
            order by u.created_at desc limit 8) t)
  );
end $$;

create or replace function public.admin_list_users(
  p_search text default null, p_plan text default null, p_status text default null,
  p_limit int default 50, p_offset int default 0)
returns table (
  user_id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz, account_id uuid, account_name text,
  plan text, account_status text, pages jsonb, staff_role text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Solo para el equipo de Vidriera.' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, pr.full_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
         acc.id, acc.name, acc.plan, acc.status,
         coalesce((select jsonb_agg(jsonb_build_object('id', pg.id, 'slug', pg.slug, 'status', pg.status) order by pg.created_at)
                   from public.pages pg where pg.account_id = acc.id), '[]'::jsonb),
         st.role,
         count(*) over ()
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.staff st on st.user_id = u.id
  left join lateral (
    select a.id, a.name, a.plan, a.status
    from public.account_members m join public.accounts a on a.id = m.account_id
    where m.user_id = u.id
    order by (m.role = 'owner') desc, a.created_at
    limit 1) acc on true
  where (v_q is null
         or u.email ilike '%' || v_q || '%'
         or pr.full_name ilike '%' || v_q || '%'
         or exists (select 1 from public.pages pg where pg.account_id = acc.id and pg.slug ilike '%' || v_q || '%'))
    and (p_plan is null or p_plan = '' or acc.plan = p_plan)
    and (p_status is null or p_status = ''
         or (p_status = 'suspendida' and (acc.status = 'suspendida' or u.banned_until > now()))
         or (p_status = 'activa' and coalesce(acc.status, 'activa') = 'activa' and (u.banned_until is null or u.banned_until <= now()))
         or (p_status = 'sin_confirmar' and u.email_confirmed_at is null))
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.admin_get_user(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'Solo para el equipo de Vidriera.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
      'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', jsonb_build_object('full_name', pr.full_name),
    'staff_role', st.role,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'plan', a.plan, 'status', a.status, 'trial_ends_at', a.trial_ends_at,
        'suspended_reason', a.suspended_reason, 'role', m.role, 'created_at', a.created_at,
        'members', (select count(*) from public.account_members mm where mm.account_id = a.id),
        'pages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', pg.id, 'slug', pg.slug, 'name', pg.name, 'status', pg.status,
            'moderation_note', pg.moderation_note, 'created_at', pg.created_at, 'updated_at', pg.updated_at,
            'visits_30d', (select count(*) from public.events e where e.page_id = pg.id and e.type = 'page_view'
                           and e.created_at > now() - interval '30 days')) order by pg.created_at)
          from public.pages pg where pg.account_id = a.id), '[]'::jsonb),
        'orders_30d', (select count(*) from public.orders o where o.account_id = a.id
                       and o.created_at > now() - interval '30 days' and o.status <> 'cancelado'),
        'revenue_30d', (select coalesce(sum(o.total), 0) from public.orders o where o.account_id = a.id
                        and o.created_at > now() - interval '30 days' and o.status in ('pagado', 'entregado')),
        'leads_30d', (select count(*) from public.leads l where l.account_id = a.id
                      and l.created_at > now() - interval '30 days')
      ) order by a.created_at)
      from public.account_members m join public.accounts a on a.id = m.account_id
      where m.user_id = u.id), '[]'::jsonb)
  ) into v_result
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.staff st on st.user_id = u.id
  where u.id = p_user;
  return v_result;
end $$;

create or replace function public.admin_list_pages(
  p_search text default null, p_status text default null, p_limit int default 50, p_offset int default 0)
returns table (
  page_id uuid, slug text, name text, status text, moderation_note text, created_at timestamptz,
  account_id uuid, account_name text, plan text, account_status text,
  owner_id uuid, owner_email text, visits_30d bigint, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Solo para el equipo de Vidriera.' using errcode = '42501';
  end if;
  return query
  select pg.id, pg.slug, pg.name, pg.status, pg.moderation_note, pg.created_at,
         a.id, a.name, a.plan, a.status,
         ow.user_id, ow.email::text,
         (select count(*) from public.events e where e.page_id = pg.id and e.type = 'page_view'
          and e.created_at > now() - interval '30 days'),
         count(*) over ()
  from public.pages pg
  join public.accounts a on a.id = pg.account_id
  left join lateral (
    select m.user_id, u.email from public.account_members m join auth.users u on u.id = m.user_id
    where m.account_id = a.id order by (m.role = 'owner') desc, m.created_at limit 1) ow on true
  where (v_q is null or pg.slug ilike '%' || v_q || '%' or pg.name ilike '%' || v_q || '%' or ow.email ilike '%' || v_q || '%')
    and (p_status is null or p_status = '' or pg.status = p_status)
  order by pg.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Cierra todas las sesiones de un usuario (solo desde el servidor)
create or replace function public.admin_revoke_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Pasa a Inicial las cuentas con la prueba vencida (programalo con pg_cron)
create or replace function public.expire_trials()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  update public.accounts set plan = 'inicial', trial_ends_at = null
  where trial_ends_at is not null and trial_ends_at < now() and plan <> 'inicial';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 10. Permisos de ejecución de funciones
-- ---------------------------------------------------------------------
-- Internas: nadie las llama desde el navegador
revoke execute on function public.free_slug(text, text) from public, anon, authenticated;
revoke execute on function public.create_page_from_template(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.expire_trials() from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;
grant execute on function public.expire_trials() to service_role;
grant execute on function public.free_slug(text, text) to service_role;
grant execute on function public.create_page_from_template(uuid, text, text, text, text, boolean) to service_role;

-- Públicas (página pública y registro)
grant execute on function public.get_public_page(text) to anon, authenticated;
grant execute on function public.slug_available(text) to anon, authenticated;

-- Solo usuarios con sesión (cada una verifica permisos adentro)
revoke execute on function public.save_page(uuid, jsonb) from public, anon;
revoke execute on function public.get_page_doc(uuid) from public, anon;
revoke execute on function public.create_page(uuid, text, text, text, text) from public, anon;
revoke execute on function public.page_stats(uuid, int) from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_list_users(text, text, text, int, int) from public, anon;
revoke execute on function public.admin_get_user(uuid) from public, anon;
revoke execute on function public.admin_list_pages(text, text, int, int) from public, anon;
grant execute on function public.save_page(uuid, jsonb) to authenticated, service_role;
grant execute on function public.get_page_doc(uuid) to authenticated, service_role;
grant execute on function public.create_page(uuid, text, text, text, text) to authenticated;
grant execute on function public.page_stats(uuid, int) to authenticated, service_role;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_list_pages(text, text, int, int) to authenticated;
