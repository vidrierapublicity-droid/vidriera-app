import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { ago, day, int, money } from '@/lib/format'
import { ACTION_LABEL, TARGET_LABEL } from '@/lib/admin-labels'

type LogRow = { id: number; actor_email: string | null; action: string; target_type: string; target_id: string; created_at: string }

type Overview = {
  users: number; users_7d: number; unconfirmed: number; pages_published: number; pages_suspended: number
  accounts_suspended: number; plans: Record<string, number>; trials_active: number; orders_30d: number
  gmv_30d: number; visits_30d: number
  signups_by_day: { day: string; users: number }[]
  recent_users: { id: string; email: string; created_at: string; full_name: string | null; slug: string | null }[]
}

export default async function AdminHome() {
  await requireStaff()
  const supabase = await createClient()
  const [{ data, error }, { data: logData }] = await Promise.all([
    supabase.rpc('admin_overview'),
    supabase.from('audit_log').select('id, actor_email, action, target_type, target_id, created_at').order('created_at', { ascending: false }).limit(8),
  ])
  const log = (logData ?? []) as LogRow[]
  if (error || !data) return <p className="notice notice-err">No se pudo cargar el resumen: {error?.message}</p>
  const o = data as Overview
  const maxDay = Math.max(1, ...o.signups_by_day.map((d) => d.users))
  const signups30 = o.signups_by_day.reduce((a, d) => a + d.users, 0)

  return (
    <>
      <div className="ph"><div><h1>Resumen</h1><p className="ph-sub">Toda la plataforma, en vivo</p></div></div>

      <section className="tiles-4">
        <article className="tile"><div className="tile-label">Usuarios</div><div className="tile-value">{int(o.users)}</div><div className="tile-foot muted">+{int(o.users_7d)} en 7 días · {int(o.unconfirmed)} sin confirmar</div></article>
        <article className="tile"><div className="tile-label">Páginas publicadas</div><div className="tile-value">{int(o.pages_published)}</div><div className="tile-foot muted">{int(o.pages_suspended)} páginas y {int(o.accounts_suspended)} cuentas suspendidas</div></article>
        <article className="tile"><div className="tile-label">Cuentas por plan</div><div className="tile-value">{int(o.plans.pro ?? 0)} Pro · {int(o.plans.negocio ?? 0)} Negocio</div><div className="tile-foot muted">{int(o.plans.inicial ?? 0)} Inicial · {int(o.trials_active)} en prueba</div></article>
        <article className="tile"><div className="tile-label">Ventas de tus usuarios (30 días)</div><div className="tile-value">{money(o.gmv_30d)}</div><div className="tile-foot muted">{int(o.orders_30d)} pedidos · {int(o.visits_30d)} visitas</div></article>
      </section>

      <section className="card pad" style={{ marginBottom: 16 }}>
        <div className="cc-head"><div><h2 className="cc-title">Registros por día</h2><p className="cc-sub">Últimos 30 días · {int(signups30)} en total</p></div></div>
        <div className="minibars" role="img" aria-label={`Registros por día en los últimos 30 días. Máximo ${maxDay} en un día.`}>
          {o.signups_by_day.map((d) => (
            <span key={d.day} className="minibar" title={`${day(d.day + 'T12:00:00')}: ${d.users} registros`}>
              <i style={{ height: `${Math.max(3, (d.users / maxDay) * 100)}%`, opacity: d.users ? 1 : 0.25 }} />
            </span>
          ))}
        </div>
        <div className="minibars-axis"><span>{day(o.signups_by_day[0]?.day + 'T12:00:00')}</span><span>Hoy</span></div>
      </section>

      <div className="grid-2">
        <section className="card pad">
          <div className="cc-head"><h2 className="cc-title">Últimos registros</h2><Link className="btn btn-sm" href="/admin/usuarios">Ver todos</Link></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Usuario</th><th>Link</th><th>Alta</th></tr></thead>
            <tbody>{o.recent_users.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/usuarios/${u.id}`}><b>{u.full_name || u.email}</b></Link><span className="sub">{u.email}</span></td>
                <td className="mono">{u.slug ? `/${u.slug}` : '—'}</td>
                <td className="nowrap">{ago(u.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card pad">
          <div className="cc-head"><h2 className="cc-title">Últimas acciones del equipo</h2><Link className="btn btn-sm" href="/admin/auditoria">Ver auditoría</Link></div>
          {log.length ? (
            <ul className="feed">{log.map((l) => (
              <li key={l.id} className="feed-it no-ico">
                <span className="feed-main"><span>{ACTION_LABEL[l.action] ?? l.action}</span><span className="muted">{l.actor_email} · {TARGET_LABEL[l.target_type] ?? l.target_type}</span></span>
                <span className="feed-time">{ago(l.created_at)}</span>
              </li>
            ))}</ul>
          ) : <p className="cc-note">Todavía no hay acciones registradas.</p>}
        </section>
      </div>
    </>
  )
}
