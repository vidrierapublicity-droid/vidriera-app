import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { day, int } from '@/lib/format'
import { publicHost } from '@/lib/site'
import { PageStatus, PlanPill } from '@/components/pills'
import { Icon } from '@/components/icons'

export const metadata: Metadata = { title: 'Páginas' }

const PER_PAGE = 50

type Row = {
  page_id: string; slug: string; name: string; status: string; moderation_note: string | null; created_at: string
  account_id: string; account_name: string; plan: string; account_status: string
  owner_id: string | null; owner_email: string | null; visits_30d: number; total: number
}

export default async function PagesAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff()
  const sp = await searchParams
  const q = (sp.q ?? '').slice(0, 80)
  const estado = ['publicada', 'borrador', 'suspendida'].includes(sp.estado ?? '') ? sp.estado! : ''
  const page = Math.max(1, Number(sp.pagina) || 1)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_list_pages', {
    p_search: q || null, p_status: estado || null, p_limit: PER_PAGE, p_offset: (page - 1) * PER_PAGE,
  })
  const rows = (data ?? []) as Row[]
  const total = rows[0]?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const qs = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (estado) params.set('estado', estado)
    if (p > 1) params.set('pagina', String(p))
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Páginas</h1>
          <p className="ph-sub">{int(total)} {total === 1 ? 'página' : 'páginas'} · para moderar, entrá a la ficha del dueño</p>
        </div>
      </div>

      <form className="tbar card pad" method="get" role="search">
        <div className="search">
          <label className="sr" htmlFor="q">Buscar</label>
          <Icon name="search" />
          <input className="input" id="q" name="q" type="search" placeholder="Link, nombre o email del dueño" defaultValue={q} />
        </div>
        <label className="sr" htmlFor="estado">Estado</label>
        <select className="select select-sm" id="estado" name="estado" defaultValue={estado}>
          <option value="">Todos los estados</option>
          <option value="publicada">Publicadas</option>
          <option value="borrador">Borradores</option>
          <option value="suspendida">Suspendidas</option>
        </select>
        <button className="btn btn-ink btn-sm" type="submit">Filtrar</button>
        {q || estado ? <Link className="btn btn-ghost btn-sm" href="/admin/paginas">Limpiar</Link> : null}
      </form>

      {error ? <p className="notice notice-err">No se pudo cargar la lista: {error.message}</p> : null}

      <section className="card pad">
        {rows.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Página</th><th>Dueño</th><th>Plan</th><th>Estado</th><th className="r">Visitas 30 días</th><th>Creada</th><th><span className="sr">Acciones</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.page_id}>
                <td>
                  <b>{r.name}</b>
                  <a className="sub mono" href={`/${r.slug}`} target="_blank" rel="noreferrer">{publicHost()}/{r.slug}</a>
                </td>
                <td>
                  {r.owner_id ? <Link href={`/admin/usuarios/${r.owner_id}`}>{r.owner_email}</Link> : <span className="muted">Sin dueño</span>}
                  <span className="sub">{r.account_name}</span>
                </td>
                <td><PlanPill plan={r.plan} /></td>
                <td>
                  <PageStatus status={r.status} />
                  {r.account_status === 'suspendida' ? <span className="sub bad">Cuenta suspendida: no se ve</span> : null}
                  {r.status === 'suspendida' && r.moderation_note ? <span className="sub cell-trunc" title={r.moderation_note}>{r.moderation_note}</span> : null}
                </td>
                <td className="r">{int(r.visits_30d)}</td>
                <td className="nowrap">{day(r.created_at)}</td>
                <td className="r">
                  {r.owner_id ? <Link className="btn btn-sm" href={`/admin/usuarios/${r.owner_id}#pagina-${r.page_id}`}>Moderar</Link> : null}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <div className="empty"><h3>No hay páginas con esos filtros</h3><p>Probá con otra búsqueda o limpiá los filtros.</p></div>
        )}
        {pages > 1 ? (
          <div className="pager">
            <span>Página {page} de {pages}</span>
            <div className="row">
              {page > 1 ? <Link className="btn btn-sm" href={`/admin/paginas${qs(page - 1)}`}>Anteriores</Link> : null}
              {page < pages ? <Link className="btn btn-sm" href={`/admin/paginas${qs(page + 1)}`}>Siguientes</Link> : null}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}
