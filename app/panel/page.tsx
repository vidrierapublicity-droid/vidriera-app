import type { Metadata } from 'next'
import { ActionForm, Submit } from '@/components/action-form'
import { Icon } from '@/components/icons'
import { PageStatus, PlanPill } from '@/components/pills'
import { createPage, updatePageBasics } from '@/app/panel/actions'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ago, int, money } from '@/lib/format'
import { publicHost } from '@/lib/site'
import { ORDER_STATUS_LABEL, SOURCE_LABEL, type PageStats } from '@/lib/types'

export const metadata: Metadata = { title: 'Mis páginas' }

type PageRow = {
  id: string; slug: string; name: string; bio: string; location: string; status: string; moderation_note: string | null
  account_id: string
  accounts: { id: string; name: string; plan: string; trial_ends_at: string | null; status: string; suspended_reason: string | null } | null
}

type LeadRow = { id: string; name: string | null; email: string | null; whatsapp: string | null; form_label: string; source: string; status: string; created_at: string }
type OrderRow = { id: string; number: number; customer_name: string; total: number; status: string; payment_method: string; created_at: string }

export default async function PanelHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('/panel')
  const sp = await searchParams
  const supabase = await createClient()

  const { data: pagesData } = await supabase
    .from('pages')
    .select('id, slug, name, bio, location, status, moderation_note, account_id, accounts(id, name, plan, trial_ends_at, status, suspended_reason)')
    .order('created_at')
  const pages = (pagesData ?? []) as unknown as PageRow[]

  const stats = await Promise.all(
    pages.map(async (p) => {
      const { data } = await supabase.rpc('page_stats', { p_page: p.id, p_days: 30 })
      return (data as PageStats | null) ?? null
    }),
  )
  const [{ data: leadsData }, { data: ordersData }] = await Promise.all([
    supabase.from('leads').select('id, name, email, whatsapp, form_label, source, status, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('orders').select('id, number, customer_name, total, status, payment_method, created_at').order('created_at', { ascending: false }).limit(6),
  ])
  const leads = (leadsData ?? []) as LeadRow[]
  const orders = (ordersData ?? []) as OrderRow[]
  const account = pages[0]?.accounts ?? null

  return (
    <>
      <div className="ph">
        <div>
          <h1>Mis páginas</h1>
          <p className="ph-sub">{account ? <PlanPill plan={account.plan} trialEndsAt={account.trial_ends_at} /> : null}<span>Los cambios se publican al instante</span></p>
        </div>
      </div>

      {sp.bienvenida ? <p className="notice notice-ok">¡Bienvenida/o! Tu página ya está creada. Completá tus datos y compartí el link.</p> : null}
      {sp.clave === 'ok' ? <p className="notice notice-ok">Listo, tu contraseña nueva ya está activa.</p> : null}
      {account?.status === 'suspendida' ? (
        <p className="notice notice-err">Tu cuenta está suspendida{account.suspended_reason ? `: ${account.suspended_reason}` : ''}. Escribinos a soporte para revisarlo.</p>
      ) : null}

      <div className="stack">
        {pages.map((p, i) => {
          const s = stats[i]
          const url = `${publicHost()}/${p.slug}`
          return (
            <section key={p.id} className="card pad stack" aria-label={`Página ${p.slug}`}>
              <div className="row between">
                <div className="stack" style={{ gap: 4 }}>
                  <h2 className="card-title" style={{ fontSize: 18 }}>{p.name || p.slug}</h2>
                  <p className="row"><span className="mono muted">{url}</span><PageStatus status={p.status} /></p>
                </div>
                <a className="btn btn-primary" href={`/${p.slug}`} target="_blank" rel="noopener noreferrer"><Icon name="external" /><span>Ver página</span></a>
              </div>
              {p.status === 'suspendida' && p.moderation_note ? <p className="notice notice-err">Suspendida por el equipo: {p.moderation_note}</p> : null}

              {s ? (
                <div className="tiles-5">
                  <div className="tile"><div className="tile-label">Visitas</div><div className="tile-value">{int(s.totals.visits)}</div><div className="tile-foot muted">últimos {s.days} días</div></div>
                  <div className="tile"><div className="tile-label">Clics</div><div className="tile-value">{int(s.totals.clicks)}</div></div>
                  <div className="tile"><div className="tile-label">Contactos</div><div className="tile-value">{int(s.totals.leads)}</div></div>
                  <div className="tile"><div className="tile-label">Pedidos</div><div className="tile-value">{int(s.totals.orders)}</div></div>
                  <div className="tile"><div className="tile-label">Cobrado</div><div className="tile-value">{money(s.totals.revenue)}</div></div>
                </div>
              ) : null}
              {s && s.by_source.length ? (
                <p className="hint">Llegan sobre todo desde {s.by_source.slice(0, 3).map((x) => `${SOURCE_LABEL[x.source] ?? x.source} (${int(x.visits)})`).join(', ')}.</p>
              ) : null}

              <details className="details">
                <summary>Editar datos básicos</summary>
                <ActionForm action={updatePageBasics.bind(null, p.id)} className="stack" >
                  <div className="grid-f">
                    <div className="field"><label className="label" htmlFor={`n-${p.id}`}>Nombre</label><input className="input" id={`n-${p.id}`} name="name" defaultValue={p.name} maxLength={60} /></div>
                    <div className="field"><label className="label" htmlFor={`s-${p.id}`}>Link</label><div className="ig"><span className="pre">{publicHost()}/</span><input id={`s-${p.id}`} name="slug" defaultValue={p.slug} maxLength={30} autoCapitalize="off" spellCheck={false} /></div></div>
                  </div>
                  <div className="field"><label className="label" htmlFor={`b-${p.id}`}>Descripción</label><textarea className="textarea" id={`b-${p.id}`} name="bio" defaultValue={p.bio} maxLength={160} rows={2} /></div>
                  <div className="field"><label className="label" htmlFor={`l-${p.id}`}>Ubicación</label><input className="input" id={`l-${p.id}`} name="location" defaultValue={p.location} maxLength={60} /></div>
                  <label className="switch"><input type="checkbox" name="published" defaultChecked={p.status === 'publicada'} disabled={p.status === 'suspendida'} /><span className="switch-track" aria-hidden="true" /><span>Página publicada</span></label>
                  <div><Submit className="btn btn-ink">Guardar</Submit></div>
                </ActionForm>
              </details>
              <p className="hint">Bloques, productos y diseño se editan con el editor visual (próxima etapa). La API ya está lista en <span className="mono">/api/editor/{p.id}</span>.</p>
            </section>
          )
        })}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card pad">
          <h2 className="cc-title">Contactos recientes</h2>
          {leads.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Persona</th><th>Formulario</th><th>Origen</th><th>Cuándo</th></tr></thead>
              <tbody>{leads.map((l) => (
                <tr key={l.id}><td><b>{l.name || l.email || l.whatsapp}</b><span className="sub">{l.name ? l.email || l.whatsapp : ''}</span></td><td>{l.form_label}</td><td>{SOURCE_LABEL[l.source] ?? l.source}</td><td className="nowrap">{ago(l.created_at)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="cc-note">Cuando alguien complete un formulario de tu página, aparece acá.</p>}
        </section>
        <section className="card pad">
          <h2 className="cc-title">Pedidos recientes</h2>
          {orders.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th className="r">Total</th></tr></thead>
              <tbody>{orders.map((o) => (
                <tr key={o.id}><td className="nowrap"><b>#{o.number}</b><span className="sub">{ago(o.created_at)}</span></td><td>{o.customer_name}</td><td>{ORDER_STATUS_LABEL[o.status] ?? o.status}</td><td className="r">{money(o.total)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="cc-note">Los pedidos llegan cuando se active el cobro online (etapa 2).</p>}
        </section>
      </div>

      {account ? (
        <section className="card pad stack" style={{ marginTop: 16 }}>
          <h2 className="cc-title">Crear otra página</h2>
          <p className="hint">Tu plan permite más de una página (Inicial: 1, Pro: 3, Negocio: 10).</p>
          <ActionForm action={createPage.bind(null, account.id)} className="stack">
            <div className="grid-f">
              <div className="field"><label className="label" htmlFor="np-name">Nombre</label><input className="input" id="np-name" name="name" maxLength={60} required /></div>
              <div className="field"><label className="label" htmlFor="np-slug">Link</label><div className="ig"><span className="pre">{publicHost()}/</span><input id="np-slug" name="slug" maxLength={30} required autoCapitalize="off" spellCheck={false} /></div></div>
            </div>
            <div><Submit>Crear página</Submit></div>
          </ActionForm>
        </section>
      ) : null}
    </>
  )
}
