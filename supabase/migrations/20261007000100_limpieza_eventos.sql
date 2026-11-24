-- Limpieza de estadísticas: la tabla de eventos (una fila por visita, click,
-- etc.) crece sin parar. Esta función borra los eventos más viejos que
-- p_days, manteniendo de sobra para los períodos que muestra el panel
-- (hasta 90 días, comparados contra los 90 anteriores). Se programa igual
-- que expire_trials() (ver README, paso 8).

create index if not exists events_created_idx on public.events (created_at);

create or replace function public.purge_old_events(p_days int default 400)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_borrados bigint;
begin
  if p_days < 180 then
    raise exception 'p_days muy bajo: dejaría sin historial los períodos que compara el panel.' using errcode = '22023';
  end if;
  delete from public.events where created_at < now() - make_interval(days => p_days);
  get diagnostics v_borrados = row_count;
  return v_borrados;
end $$;

revoke execute on function public.purge_old_events(int) from public, anon, authenticated;
grant execute on function public.purge_old_events(int) to service_role;
