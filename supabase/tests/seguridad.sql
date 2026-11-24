-- =====================================================================
-- Pruebas de seguridad y lógica de la base (correr SOLO en una base local
-- o de pruebas: crea usuarios ficticios).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seguridad.sql
--
-- Cada chequeo imprime "ok · ..." y el script se corta en el primer fallo.
-- Todo corre dentro de una transacción que se deshace al final.
-- =====================================================================
begin;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;
create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'FALLÓ: %', msg;
  end if;
  raise notice 'ok · %', msg;
end $$;
grant execute on function tests.ok(boolean, text) to anon, authenticated, service_role;

-- "Iniciar sesión" como un usuario dentro de la transacción
create or replace function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

-- ---------------------------------------------------------------------
-- Registro: 4 usuarios
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'mika@example.com',
   '{"full_name": "Micaela R.", "page_name": "Mika Cerámica", "slug": "mika", "goal": "productos", "theme": "esmalte"}', null),
  ('b0000000-0000-4000-8000-00000000000b', 'lola@example.com',
   '{"full_name": "Lola G.", "page_name": "Panadería Lola", "slug": "mika", "goal": "servicios"}', now()),
  ('c0000000-0000-4000-8000-00000000000c', 'admin@example.com',
   '{"full_name": "Equipo Vidriera", "slug": "admin"}', now()),
  ('d0000000-0000-4000-8000-00000000000d', 'sinmeta@example.com', '{}', now());

select tests.ok((select count(*) = 4 from public.profiles), 'se crea un perfil por usuario');
select tests.ok((select count(*) = 4 from public.accounts where plan = 'pro' and trial_ends_at > now()), 'cada cuenta arranca en Pro con prueba');
select tests.ok((select count(*) = 4 from public.account_members where role = 'owner'), 'cada usuario es dueño de su cuenta');
select tests.ok((select status = 'borrador' from public.pages where slug = 'mika'), 'la página espera la confirmación del email');
select tests.ok((select count(*) = 3 from public.products p join public.pages g on g.id = p.page_id where g.slug = 'mika'), 'la plantilla "productos" trae 3 productos');
select tests.ok((select g.slug ~ '^mika[0-9]{3}$' and g.status = 'publicada'
                 from public.pages g join public.accounts a on a.id = g.account_id
                 where a.created_by = 'b0000000-0000-4000-8000-00000000000b'), 'un link tomado se resuelve con un sufijo');
select tests.ok((select g.slug <> 'admin' from public.pages g join public.accounts a on a.id = g.account_id
                 where a.created_by = 'c0000000-0000-4000-8000-00000000000c'), 'un link reservado no se asigna');
select tests.ok((select g.slug = 'sinmeta' from public.pages g join public.accounts a on a.id = g.account_id
                 where a.created_by = 'd0000000-0000-4000-8000-00000000000d'), 'sin datos se usa el email como link');

update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-4000-8000-00000000000a';
select tests.ok((select status = 'publicada' from public.pages where slug = 'mika'), 'al confirmar el email la página se publica');

insert into public.staff (user_id, role) values ('c0000000-0000-4000-8000-00000000000c', 'superadmin');

-- Datos de actividad para Mika (como el servidor)
insert into public.events (page_id, type, source, visitor_hash, device, city, created_at)
select g.id, t.type, t.source, md5(i::text), 'celular', 'CABA', now() - (i || ' hours')::interval
from public.pages g,
     generate_series(1, 40) i,
     (values ('page_view', 'instagram'), ('click', 'instagram')) t(type, source)
where g.slug = 'mika';
insert into public.orders (page_id, account_id, status, payment_method, customer_name, customer_contact, subtotal, total, source)
select g.id, g.account_id, 'pagado', 'mercadopago', 'Cliente de prueba', 'cliente@example.com', 18500, 18500, 'instagram'
from public.pages g where g.slug = 'mika';
insert into public.order_items (order_id, product_id, kind, name, unit_price, quantity)
select o.id, null, 'producto', 'Taza Luna', 18500, 1 from public.orders o;
insert into public.leads (page_id, account_id, form_label, email, source)
select g.id, g.account_id, 'Lista de espera', 'fan@example.com', 'tiktok' from public.pages g where g.slug = 'mika';
insert into auth.sessions (user_id) values ('a0000000-0000-4000-8000-00000000000a'), ('a0000000-0000-4000-8000-00000000000a');

-- ---------------------------------------------------------------------
-- Visitante anónimo
-- ---------------------------------------------------------------------
select tests.as_anon();
select tests.ok(public.get_public_page('mika') -> 'page' ->> 'name' = 'Mika Cerámica', 'la página pública se lee sin sesión');
select tests.ok(jsonb_array_length(public.get_public_page('MIKA') -> 'blocks') >= 5, 'trae los bloques visibles (sin importar mayúsculas)');
select tests.ok(public.get_public_page('no-existe') is null, 'un link inexistente devuelve null');
select tests.ok(not public.slug_available('mika') and not public.slug_available('admin') and not public.slug_available('ab')
                and public.slug_available('nueva.tienda'), 'disponibilidad de links');
select tests.ok((select count(*) = 0 from public.pages), 'un anónimo no ve la tabla de páginas');
do $$ begin
  begin
    perform count(*) from public.events;
    raise exception 'FALLÓ: un anónimo leyó eventos';
  exception when insufficient_privilege then raise notice 'ok · un anónimo no puede leer eventos';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Usuario A (Mika)
-- ---------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-00000000000a');
select tests.ok((select count(*) = 1 from public.pages), 'Mika ve solo su página');
select tests.ok((select count(*) = 0 from public.pages where slug like 'mika_%'), 'Mika no ve la página de Lola');
select tests.ok((select count(*) = 1 from public.leads) and (select count(*) = 1 from public.orders), 'Mika ve sus contactos y pedidos');
update public.pages set name = 'Mika Cerámica · Taller' where slug = 'mika';
select tests.ok((select name = 'Mika Cerámica · Taller' from public.pages where slug = 'mika'), 'Mika edita su página');
with u as (update public.pages set name = 'hackeado' where slug like 'mika_%' returning 1)
select tests.ok((select count(*) = 0 from u), 'Mika no puede editar la página de Lola');
update public.accounts set name = 'Mika Cerámica SRL';
select tests.ok((select count(*) = 1 from public.accounts where name = 'Mika Cerámica SRL'), 'Mika renombra su cuenta');
do $$ begin
  begin
    update public.accounts set plan = 'negocio';
    raise exception 'FALLÓ: Mika se cambió el plan';
  exception when insufficient_privilege then raise notice 'ok · Mika no puede cambiarse el plan';
  end;
end $$;
do $$ begin
  begin
    update public.pages set status = 'suspendida' where slug = 'mika';
    raise exception 'FALLÓ: Mika suspendió su página';
  exception when insufficient_privilege then raise notice 'ok · solo el staff suspende páginas';
  end;
end $$;
do $$ begin
  begin
    update public.pages set slug = 'admin' where slug = 'mika';
    raise exception 'FALLÓ: Mika tomó un link reservado';
  exception when check_violation then raise notice 'ok · no se puede usar un link reservado';
  end;
end $$;
do $$ begin
  begin
    insert into public.staff (user_id, role) values ('a0000000-0000-4000-8000-00000000000a', 'superadmin');
    raise exception 'FALLÓ: Mika se hizo admin';
  exception when insufficient_privilege then raise notice 'ok · nadie se autoasigna como staff';
  end;
end $$;
do $$ begin
  begin
    perform public.admin_overview();
    raise exception 'FALLÓ: Mika entró al panel de admin';
  exception when insufficient_privilege then raise notice 'ok · el panel de admin rechaza a usuarios comunes';
  end;
end $$;
do $$ begin
  begin
    perform public.admin_revoke_sessions('b0000000-0000-4000-8000-00000000000b');
    raise exception 'FALLÓ: Mika cerró sesiones ajenas';
  exception when insufficient_privilege then raise notice 'ok · cerrar sesiones es solo del servidor';
  end;
end $$;
select tests.ok((public.page_stats((select id from public.pages where slug = 'mika'), 30) -> 'totals' ->> 'visits')::int = 40,
                'estadísticas: 40 visitas');
select tests.ok((public.page_stats((select id from public.pages where slug = 'mika'), 30) -> 'totals' ->> 'revenue')::numeric = 18500,
                'estadísticas: ventas cobradas');
select tests.ok(jsonb_array_length(public.page_stats((select id from public.pages where slug = 'mika'), 30) -> 'by_day') = 30,
                'estadísticas: 30 días completos');

-- Editor: guardar el documento completo
do $$
declare
  v_page uuid := (select id from public.pages where slug = 'mika');
  v_doc jsonb := public.get_page_doc(v_page);
  v_blocks jsonb := v_doc -> 'blocks';
  v_prod_idx int;
  v_res jsonb;
begin
  select (e.ordinality - 1)::int into v_prod_idx
  from jsonb_array_elements(v_blocks) with ordinality e where e.value ->> 'type' = 'products';
  -- agrego un producto nuevo, un enlace nuevo y quito el último bloque (texto)
  v_blocks := jsonb_set(v_blocks, array[v_prod_idx::text, 'products'],
    (v_blocks -> v_prod_idx -> 'products') || '[{"id": "tmp_p1", "name": "Taza Luna", "price": "18500", "stock": "6"}]'::jsonb);
  v_blocks := (v_blocks - (jsonb_array_length(v_blocks) - 1))
    || '[{"id": "tmp_b1", "type": "link", "visible": true, "data": {"title": "Clases de torno", "url": "https://example.com"}}]'::jsonb;
  v_res := public.save_page(v_page, jsonb_set(v_doc, '{blocks}', v_blocks));
  perform tests.ok(v_res -> 'ids' ? 'tmp_p1' and v_res -> 'ids' ? 'tmp_b1', 'el editor recibe los ids nuevos');
  perform tests.ok((select count(*) = 4 from public.products where page_id = v_page), 'se guardó el producto nuevo');
  perform tests.ok(not exists (select 1 from public.blocks where page_id = v_page and type = 'text'), 'se borró el bloque quitado');
  perform tests.ok((select data ->> 'title' = 'Clases de torno' from public.blocks where page_id = v_page and position = jsonb_array_length(v_blocks) - 1),
                   'el bloque nuevo quedó al final');
end $$;
do $$ begin
  begin
    perform public.save_page((select id from public.pages where slug like 'mika_%' limit 1), '{"blocks": []}');
    raise exception 'FALLÓ: Mika guardó la página de Lola';
  exception when insufficient_privilege then raise notice 'ok · no se puede guardar una página ajena';
  end;
end $$;
reset role;

-- Límite del plan Inicial (5 productos)
update public.accounts set plan = 'inicial', trial_ends_at = null
where created_by = 'a0000000-0000-4000-8000-00000000000a';
select tests.login('a0000000-0000-4000-8000-00000000000a');
do $$
declare
  v_page uuid := (select id from public.pages where slug = 'mika');
  v_block uuid := (select id from public.blocks where page_id = v_page and type = 'products');
begin
  insert into public.products (page_id, block_id, name, price) values (v_page, v_block, 'Quinto', 1000);
  perform tests.ok(true, 'plan Inicial: el quinto producto entra');
  begin
    insert into public.products (page_id, block_id, name, price) values (v_page, v_block, 'Sexto', 1000);
    raise exception 'FALLÓ: el plan Inicial aceptó 6 productos';
  exception when raise_exception then raise notice 'ok · plan Inicial: el sexto producto se rechaza';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Usuario B (Lola)
-- ---------------------------------------------------------------------
select tests.login('b0000000-0000-4000-8000-00000000000b');
select tests.ok((select count(*) = 0 from public.leads) and (select count(*) = 0 from public.orders), 'Lola no ve contactos ni pedidos de Mika');
do $$ begin
  begin
    perform public.page_stats((select id from public.pages where slug = 'mika'), 30);
    raise exception 'FALLÓ: Lola vio las estadísticas de Mika';
  exception when insufficient_privilege then raise notice 'ok · estadísticas ajenas bloqueadas';
  end;
end $$;
select tests.ok(public.create_page((select id from public.accounts limit 1), 'lola.dos', 'Lola eventos') is not null,
                'Lola crea una segunda página dentro de su plan');
do $$ begin
  begin
    perform public.create_page((select id from public.accounts limit 1), 'lola.dos', 'Repetida');
    raise exception 'FALLÓ: se repitió un link';
  exception when unique_violation then raise notice 'ok · no se repiten links';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Staff (superadmin)
-- ---------------------------------------------------------------------
select tests.login('c0000000-0000-4000-8000-00000000000c');
select tests.ok((public.admin_overview() ->> 'users')::int = 4, 'panel: 4 usuarios');
select tests.ok((select count(*) = 4 from public.admin_list_users()), 'panel: lista de usuarios');
select tests.ok((select count(*) = 1 from public.admin_list_users('lola')), 'panel: búsqueda por email');
select tests.ok((select count(*) = 2 from public.admin_list_users('mika')), 'panel: búsqueda por email o link');
select tests.ok(public.admin_get_user('a0000000-0000-4000-8000-00000000000a') -> 'accounts' -> 0 ->> 'plan' = 'inicial',
                'panel: detalle de usuario con plan');
select tests.ok((select count(*) >= 5 from public.admin_list_pages()), 'panel: lista de páginas');
select tests.ok((select count(*) >= 5 from public.pages), 'el staff ve todas las páginas');
select tests.ok(public.page_stats((select id from public.pages where slug = 'mika'), 30) is not null, 'el staff ve estadísticas de cualquiera');
do $$ begin
  begin
    update public.pages set slug = 'admin'
    where account_id in (select a.id from public.accounts a where a.created_by = 'c0000000-0000-4000-8000-00000000000c');
    raise exception 'FALLÓ: el staff saltó las reglas en su propia página';
  exception when check_violation then raise notice 'ok · con su sesión, el staff tiene las mismas reglas en su página';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Servidor (clave secreta): acciones del panel de admin
-- ---------------------------------------------------------------------
select tests.as_service();
select tests.ok(public.admin_revoke_sessions('a0000000-0000-4000-8000-00000000000a') = 2, 'cerrar sesiones: 2 sesiones borradas');
update public.pages set status = 'suspendida', moderation_note = 'Prueba' where slug = 'mika';
update public.accounts set status = 'suspendida', suspended_reason = 'Prueba'
where created_by = 'b0000000-0000-4000-8000-00000000000b';
reset role;
select tests.as_anon();
select tests.ok(public.get_public_page('mika') is null, 'una página suspendida no se muestra');
select tests.ok(public.get_public_page('lola.dos') is null, 'una cuenta suspendida oculta todas sus páginas');
reset role;
select tests.login('a0000000-0000-4000-8000-00000000000a');
do $$ begin
  begin
    update public.pages set status = 'publicada' where slug = 'mika';
    raise exception 'FALLÓ: Mika levantó su suspensión';
  exception when insufficient_privilege then raise notice 'ok · el dueño no puede levantar una suspensión';
  end;
end $$;
do $$ begin
  begin
    delete from public.pages where slug = 'mika';
    raise exception 'FALLÓ: Mika borró su página suspendida';
  exception when insufficient_privilege then raise notice 'ok · una página suspendida no se puede borrar (ni recrear con el mismo link)';
  end;
end $$;
reset role;

select tests.ok(public.expire_trials() >= 0, 'vencimiento de pruebas');

rollback;
