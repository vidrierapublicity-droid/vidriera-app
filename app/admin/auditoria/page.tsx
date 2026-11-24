import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { dateTime, int } from '@/lib/format'
import { ACTION_LABEL, TARGET_LABEL, describeDetails } from '@/lib/admin-labels'
import { Icon } from '@/components/icons'

export const metadata: Metadata = { title: 'Auditoría' }

const PER_PAGE = 50

type LogRow = {
  id: number; actor_id: string | null; actor_email: string | null; action: string; target_type: string
  target_id: string; details: Record<string, unknown> | null; created_at: string
}
type PageRef = { id: string; slug: string; accounts: { created_by: string | null } | null }
type AccountRef = { id: string; name: string; created_by: string | null }
type ProfileRef = { id: string; full_name: string | null }

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff()
  const sp = await searchParams
  const accion = sp.accion && ACTION_LABEL[sp.accion] ? sp.accion : ''
  const tipo = sp.tipo && TARGET_LABEL[sp.tipo] ? sp.tipo : ''
  const quien = (sp.quien ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number(sp.pagina) || 1)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()
  let query = supabase
    .from('audit_log')
    .select('id, actor_id, actor_email, action, target_type, target_id, details, created_at', { count: 'exact' })
  if (accion) query = query.eq('action', accion)
  if (tipo) query = query.eq('target_type', tipo)
  if (quien) query = query.ilike('actor_email', `%${quien.replace(/[%_\\]/g, (m) => '\\' + m)}%`)
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + PER_PAGE - 1)
  const rows = (data ?? []) as LogRow[]
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  // Nombres legibles para lo que se tocó (si todavía existe)
  const ids = (t: string) => [...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id))]
  const pageIds = ids('page')
  const accountIds = ids('account')
  const userIds = [...new Set([...ids('user'), ...ids('staff')])]
  const [pagesRes, accountsRes, profilesRes] = await Promise.all([
    pageIds.length ? supabase.from('pages').select('id, slug, accounts(created_by)').in('id', pageIds) : null,
    accountIds.length ? supabase.from('accounts').select('id, name, created_by').in('id', accountIds) : null,
    userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : null,
  ])
  const pageRef = new Map(((pagesRes?.data ?? []) as unknown as PageRef[]).map((p) => [p.id, p]))
  const accountRef = new Map(((accountsRes?.data ?? []) as AccountRef[]).map((a) => [a.id, a]))
  const profileRef = new Map(((profilesRes?.data ?? []) as ProfileRef[]).map((p) => [p.id, p]))

  function target(r: LogRow) {
    if (r.target_type === 'user' || r.target_type === 'staff') {
      const p = profileRef.get(r.target_id)
      if (!p) return <span className="muted">Usuario borrado</span>
      return <Link href={`/admin/usuarios/${r.target_id}`}>{p.full_name || 'Ver usuario'}</Link>
    }
    if (r.target_type === 'page') {
      const p = pageRef.get(r.target_id)
      if (!p) return <span className="muted">Página borrada</span>
      const owner = p.accounts?.created_by
      return owner ? <Link className="mono" href={`/admin/usuarios/${owner}#pagina-${p.id}`}>/{p.slug}</Link> : <span className="mono">/{p.slug}</span>
    }
    if (r.target_type === 'account') {
      const a = accountRef.get(r.target_id)
      if (!a) return <span className="muted">Cuenta borrada</span>
      return a.created_by ? <Link href={`/admin/usuarios/${a.created_by}`}>{a.name}</Link> : <span>{a.name}</span>
    }
    return <span className="mono">{r.target_id.slice(0, 8)}</span>
  }

  const qs = (p: number) => {
    const params = new URLSearchParams()
    if (accion) params.set('accion', accion)
    if (tipo) params.set('tipo', tipo)
    if (quien) params.set('quien', quien)
    if (p > 1) params.set('pagina', String(p))
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Auditoría</h1>
          <p className="ph-sub">Cada acción del equipo queda registrada y no se puede editar ni borrar desde la app</p>
        </div>
      </div>

      <form className="tbar card pad" method="get" role="search">
        <div className="search">
          <label className="sr" htmlFor="quien">Quién</label>
          <Icon name="search" />
          <input className="input" id="quien" name="quien" type="search" placeholder="Email de quien lo hizo" defaultValue={quien} />
        </div>
        <label className="sr" htmlFor="accion">Acción</label>
        <select className="select select-sm" id="accion" name="accion" defaultValue={accion}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="sr" htmlFor="tipo">Sobre qué</label>
        <select className="select select-sm" id="tipo" name="tipo" defaultValue={tipo}>
          <option value="">Todo</option>
          {Object.entries(TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-ink btn-sm" type="submit">Filtrar</button>
        {accion || tipo || quien ? <Link className="btn btn-ghost btn-sm" href="/admin/auditoria">Limpiar</Link> : null}
      </form>

      {error ? <p className="notice notice-err">No se pudo cargar la auditoría: {error.message}</p> : null}

      <section className="card pad">
        {rows.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Qué hizo</th><th>Sobre</th><th>Detalle</th></tr></thead>
            <tbody>{rows.map((r) => {
              const detail = describeDetails(r.details)
              return (
                <tr key={r.id}>
                  <td className="nowrap">{dateTime(r.created_at)}</td>
                  <td>{r.actor_email ?? <span className="muted">Sistema</span>}</td>
                  <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td><span className="sub">{TARGET_LABEL[r.target_type] ?? r.target_type}</span>{target(r)}</td>
                  <td className="cell-trunc" title={detail}>{detail || <span className="muted">—</span>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        ) : (
          <div className="empty"><h3>No hay acciones registradas{accion || tipo || quien ? ' con esos filtros' : ' todavía'}</h3><p>Acá aparece todo lo que hace el equipo: cambios de plan, suspensiones, links de contraseña y más.</p></div>
        )}
        {pages > 1 ? (
          <div className="pager">
            <span>Página {page} de {pages} · {int(total)} acciones</span>
            <div className="row">
              {page > 1 ? <Link className="btn btn-sm" href={`/admin/auditoria${qs(page - 1)}`}>Más nuevas</Link> : null}
              {page < pages ? <Link className="btn btn-sm" href={`/admin/auditoria${qs(page + 1)}`}>Más viejas</Link> : null}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}
