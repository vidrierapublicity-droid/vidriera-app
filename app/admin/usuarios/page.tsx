import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { ago, day, int } from '@/lib/format'
import { AccountStatus, PlanPill } from '@/components/pills'
import { Icon } from '@/components/icons'

export const metadata: Metadata = { title: 'Usuarios' }

const PER_PAGE = 50

type Row = {
  user_id: string; email: string; full_name: string | null; created_at: string; last_sign_in_at: string | null
  email_confirmed_at: string | null; banned_until: string | null; account_id: string | null; account_name: string | null
  plan: string | null; account_status: string | null; pages: { id: string; slug: string; status: string }[]
  staff_role: string | null; total: number
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff()
  const sp = await searchParams
  const q = (sp.q ?? '').slice(0, 80)
  const plan = ['inicial', 'pro', 'negocio'].includes(sp.plan ?? '') ? sp.plan! : ''
  const estado = ['activa', 'suspendida', 'sin_confirmar'].includes(sp.estado ?? '') ? sp.estado! : ''
  const page = Math.max(1, Number(sp.pagina) || 1)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: q || null, p_plan: plan || null, p_status: estado || null, p_limit: PER_PAGE, p_offset: (page - 1) * PER_PAGE,
  })
  const rows = (data ?? []) as Row[]
  const total = rows[0]?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const qs = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (plan) params.set('plan', plan)
    if (estado) params.set('estado', estado)
    if (p > 1) params.set('pagina', String(p))
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <>
      <div className="ph"><div><h1>Usuarios</h1><p className="ph-sub">{int(total)} {total === 1 ? 'resultado' : 'resultados'}</p></div></div>
      {sp.aviso === 'borrado' ? <p className="notice notice-ok">Usuario borrado. Quedó registrado en la auditoría.</p> : null}

      <form className="tbar card pad" method="get" role="search">
        <div className="search">
          <label className="sr" htmlFor="q">Buscar</label>
          <Icon name="search" />
          <input className="input" id="q" name="q" type="search" placeholder="Email, nombre o link" defaultValue={q} />
        </div>
        <label className="sr" htmlFor="plan">Plan</label>
        <select className="select select-sm" id="plan" name="plan" defaultValue={plan}>
          <option value="">Todos los planes</option>
          <option value="inicial">Inicial</option>
          <option value="pro">Pro</option>
          <option value="negocio">Negocio</option>
        </select>
        <label className="sr" htmlFor="estado">Estado</label>
        <select className="select select-sm" id="estado" name="estado" defaultValue={estado}>
          <option value="">Todos los estados</option>
          <option value="activa">Activas</option>
          <option value="suspendida">Suspendidas</option>
          <option value="sin_confirmar">Sin confirmar email</option>
        </select>
        <button className="btn btn-ink btn-sm" type="submit">Filtrar</button>
        {q || plan || estado ? <Link className="btn btn-ghost btn-sm" href="/admin/usuarios">Limpiar</Link> : null}
      </form>

      {error ? <p className="notice notice-err">No se pudo cargar la lista: {error.message}</p> : null}

      <section className="card pad">
        {rows.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Usuario</th><th>Páginas</th><th>Plan</th><th>Estado</th><th>Alta</th><th>Último ingreso</th></tr></thead>
            <tbody>{rows.map((r) => {
              const banned = Boolean(r.banned_until && new Date(r.banned_until).getTime() > Date.now())
              return (
                <tr key={r.user_id}>
                  <td>
                    <Link href={`/admin/usuarios/${r.user_id}`}><b>{r.full_name || r.email}</b></Link>
                    {r.staff_role ? <span className="chip chip-brand" style={{ marginLeft: 6 }}>{r.staff_role}</span> : null}
                    <span className="sub">{r.email}</span>
                  </td>
                  <td className="mono">{r.pages.length ? r.pages.map((p) => `/${p.slug}`).join(', ') : '—'}</td>
                  <td><PlanPill plan={r.plan} /></td>
                  <td>
                    <AccountStatus status={r.account_status} banned={banned} />
                    {!r.email_confirmed_at ? <span className="sub">Email sin confirmar</span> : null}
                  </td>
                  <td className="nowrap">{day(r.created_at)}</td>
                  <td className="nowrap">{ago(r.last_sign_in_at)}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        ) : (
          <div className="empty"><h3>No hay usuarios con esos filtros</h3><p>Probá con otra búsqueda o limpiá los filtros.</p></div>
        )}
        {pages > 1 ? (
          <div className="pager">
            <span>Página {page} de {pages}</span>
            <div className="row">
              {page > 1 ? <Link className="btn btn-sm" href={`/admin/usuarios${qs(page - 1)}`}>Anteriores</Link> : null}
              {page < pages ? <Link className="btn btn-sm" href={`/admin/usuarios${qs(page + 1)}`}>Siguientes</Link> : null}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}
