import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { UUID_RE } from '@/lib/analytics'
import { ago, dateTime, day, int, money } from '@/lib/format'
import { publicHost } from '@/lib/site'
import { ACTION_LABEL, TARGET_LABEL, describeDetails } from '@/lib/admin-labels'
import { ActionForm, Submit } from '@/components/action-form'
import { AccountStatus, PageStatus, PlanPill } from '@/components/pills'
import { Icon } from '@/components/icons'
import {
  changeSlug,
  changeUserEmail,
  confirmUserEmail,
  deleteUser,
  generateRecoveryLink,
  revokeSessions,
  sendPasswordReset,
  setPageStatus,
  setPlan,
  setStaffRole,
  setUserSuspended,
} from '@/app/admin/actions'

export const metadata: Metadata = { title: 'Usuario' }

type AdminPage = {
  id: string; slug: string; name: string; status: string; moderation_note: string | null
  created_at: string; updated_at: string; visits_30d: number
}
type AdminAccount = {
  id: string; name: string; plan: string; status: string; trial_ends_at: string | null; suspended_reason: string | null
  role: 'owner' | 'editor'; created_at: string; members: number; pages: AdminPage[]
  orders_30d: number; revenue_30d: number; leads_30d: number
}
type AdminUser = {
  user: {
    id: string; email: string | null; created_at: string; last_sign_in_at: string | null
    email_confirmed_at: string | null; banned_until: string | null; providers: string[]
  }
  profile: { full_name: string | null }
  staff_role: 'superadmin' | 'soporte' | null
  accounts: AdminAccount[]
}
type LogRow = {
  id: number; actor_email: string | null; action: string; target_type: string; target_id: string
  details: Record<string, unknown> | null; created_at: string
}

const PROVIDER_LABEL: Record<string, string> = { email: 'Email y contraseña', google: 'Google' }

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff()
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_get_user', { p_user: id })
  if (error) return <p className="notice notice-err">No se pudo cargar el usuario: {error.message}</p>
  if (!data) notFound()
  const d = data as AdminUser
  const u = d.user

  // Historial: acciones sobre el usuario, sus cuentas y sus páginas
  const accountIds = d.accounts.map((a) => a.id)
  const pageIds = d.accounts.flatMap((a) => a.pages.map((p) => p.id))
  const filters = [`and(target_type.eq.user,target_id.eq.${id})`, `and(target_type.eq.staff,target_id.eq.${id})`]
  if (accountIds.length) filters.push(`and(target_type.eq.account,target_id.in.(${accountIds.join(',')}))`)
  if (pageIds.length) filters.push(`and(target_type.eq.page,target_id.in.(${pageIds.join(',')}))`)
  const { data: log } = await supabase
    .from('audit_log')
    .select('id, actor_email, action, target_type, target_id, details, created_at')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(30)

  const isSelf = u.id === me.id
  const isSuper = me.role === 'superadmin'
  // Soporte no gestiona el acceso de otras personas del equipo (lo mismo se valida en el servidor)
  const accessLocked = !isSuper && d.staff_role !== null
  const banned = Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now())
  const ownedSuspended = d.accounts.find((a) => a.role === 'owner' && a.status === 'suspendida')
  const suspended = banned || Boolean(ownedSuspended)
  const name = d.profile.full_name || u.email || 'Usuario sin nombre'
  const providers = u.providers.length ? u.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(' y ') : 'Email y contraseña'
  const pageName = new Map(d.accounts.flatMap((a) => a.pages.map((p) => [p.id, `/${p.slug}`] as const)))
  const accountName = new Map(d.accounts.map((a) => [a.id, a.name] as const))

  return (
    <>
      <Link className="backlink" href="/admin/usuarios"><Icon name="arrowRight" className="i flip" />Usuarios</Link>
      <div className="ph">
        <div>
          <h1>{name}</h1>
          <p className="ph-sub">
            <span>{u.email}</span><span aria-hidden="true">·</span>
            <span>Alta {day(u.created_at)}</span><span aria-hidden="true">·</span>
            <span>Último ingreso {ago(u.last_sign_in_at)}</span>
          </p>
        </div>
        <div className="ph-actions">
          <AccountStatus status={suspended ? 'suspendida' : 'activa'} banned={banned} />
          {d.staff_role ? <span className="chip chip-brand"><Icon name="shield" />{d.staff_role}</span> : null}
          {!u.email_confirmed_at ? <span className="pill t-warn">Email sin confirmar</span> : null}
        </div>
      </div>
      {isSelf ? <p className="notice">Esta es tu propia cuenta. Algunas acciones no están disponibles acá: usá <Link className="link" href="/panel/cuenta">Mi cuenta</Link>.</p> : null}

      {/* ---------- Acceso y contraseña ---------- */}
      <section className="card pad section" aria-labelledby="acceso">
        <div className="cc-head">
          <div>
            <h2 className="cc-title" id="acceso">Acceso y contraseña</h2>
            <p className="cc-sub">Para ayudar a alguien que no puede entrar</p>
          </div>
        </div>
        <div className="explain">
          <span className="explain-ico"><Icon name="lock" /></span>
          <p>
            La contraseña se guarda cifrada (hash bcrypt) en Supabase Auth. <b>Nadie del equipo puede verla ni elegirla</b> por la persona:
            lo que sí podés hacer es mandarle un link para que cree una nueva, o cerrar sus sesiones si perdió un dispositivo.
            Todo queda en el historial de abajo.
          </p>
        </div>
        <dl className="kv">
          <div><dt>Email de ingreso</dt><dd>{u.email ?? '—'}</dd></div>
          <div><dt>Forma de ingreso</dt><dd>{providers}</dd></div>
          <div><dt>Email confirmado</dt><dd>{u.email_confirmed_at ? dateTime(u.email_confirmed_at) : 'Todavía no'}</dd></div>
          <div><dt>Último ingreso</dt><dd>{dateTime(u.last_sign_in_at)}</dd></div>
        </dl>
        {accessLocked ? (
          <p className="notice">Es parte del equipo: solo un superadmin puede gestionar su acceso.</p>
        ) : (
          <div className="acts">
            <ActionForm action={sendPasswordReset.bind(null, u.id)} className="act">
              <div>
                <b>Mandar email para crear contraseña nueva</b>
                <p className="hint">Le llega a {u.email} un link que sirve una sola vez.</p>
              </div>
              <Submit className="btn" pendingText="Enviando…"><Icon name="mail" />Mandar email</Submit>
            </ActionForm>
            <ActionForm action={generateRecoveryLink.bind(null, u.id)} className="act">
              <div>
                <b>Generar link de recuperación</b>
                <p className="hint">Si el email no le llega: copiá el link y mandáselo por otro canal que sepas que es de la persona titular. Vence en 1 hora.</p>
              </div>
              <Submit className="btn" pendingText="Generando…"><Icon name="key" />Generar link</Submit>
            </ActionForm>
            <ActionForm action={revokeSessions.bind(null, u.id)} className="act">
              <div>
                <b>Cerrar todas las sesiones</b>
                <p className="hint">Obliga a volver a ingresar en todos los dispositivos. Útil si perdió el celular o sospecha que alguien entró.</p>
              </div>
              <Submit className="btn" pendingText="Cerrando…"><Icon name="logout" />Cerrar sesiones</Submit>
            </ActionForm>
            {!u.email_confirmed_at ? (
              <ActionForm action={confirmUserEmail.bind(null, u.id)} className="act">
                <div>
                  <b>Confirmar el email a mano</b>
                  <p className="hint">Solo si la persona te escribió desde esa casilla y el email de confirmación no le llegó. Publica sus páginas del registro.</p>
                </div>
                <Submit className="btn" pendingText="Confirmando…"><Icon name="check" />Confirmar email</Submit>
              </ActionForm>
            ) : null}
          </div>
        )}
      </section>

      {/* ---------- Estado ---------- */}
      <section className="card pad section" aria-labelledby="estado">
        <div className="cc-head">
          <div>
            <h2 className="cc-title" id="estado">Estado de la cuenta</h2>
            <p className="cc-sub">Suspender bloquea el ingreso, cierra sus sesiones, oculta todas sus páginas y le quita el rol del equipo si tenía</p>
          </div>
        </div>
        {isSelf ? (
          <p className="hint">No podés suspender tu propia cuenta.</p>
        ) : accessLocked ? (
          <p className="hint">Solo un superadmin puede suspender a alguien del equipo.</p>
        ) : suspended ? (
          <div className="stack">
            <p className="notice notice-err">
              Suspendida{ownedSuspended?.suspended_reason ? `: ${ownedSuspended.suspended_reason}` : '.'}
            </p>
            <ActionForm action={setUserSuspended.bind(null, u.id, false)} className="row">
              <Submit className="btn btn-ink" pendingText="Reactivando…">Reactivar cuenta</Submit>
            </ActionForm>
          </div>
        ) : (
          <ActionForm action={setUserSuspended.bind(null, u.id, true)} className="stack">
            <div className="field">
              <label className="label" htmlFor="reason">Motivo <span className="muted">Queda en la auditoría y lo ven los editores de sus cuentas</span></label>
              <textarea className="textarea" id="reason" name="reason" maxLength={300} required placeholder="Ej.: venta de productos no permitidos, pedido de la persona titular…" />
            </div>
            <div><Submit className="btn btn-danger" pendingText="Suspendiendo…">Suspender cuenta</Submit></div>
          </ActionForm>
        )}
      </section>

      {/* ---------- Cuentas, planes y páginas ---------- */}
      {d.accounts.length === 0 ? (
        <section className="card pad section"><p className="hint">Este usuario no tiene cuentas ni páginas.</p></section>
      ) : null}
      {d.accounts.map((a) => {
        const trialLeft = a.trial_ends_at ? Math.max(0, Math.ceil((new Date(a.trial_ends_at).getTime() - Date.now()) / 86400000)) : 0
        return (
          <section key={a.id} className="card pad section" aria-label={`Cuenta ${a.name}`}>
            <div className="cc-head">
              <div>
                <h2 className="cc-title">Cuenta «{a.name}»</h2>
                <p className="cc-sub">
                  {a.role === 'owner' ? 'Es dueño' : 'Es editor'} · {a.members} {a.members === 1 ? 'miembro' : 'miembros'} · creada {day(a.created_at)}
                </p>
              </div>
              <div className="row"><PlanPill plan={a.plan} trialEndsAt={a.trial_ends_at} /><AccountStatus status={a.status} /></div>
            </div>

            <div className="tiles-3">
              <div className="tile"><div className="tile-label">Cobrado (30 días)</div><div className="tile-value">{money(a.revenue_30d)}</div></div>
              <div className="tile"><div className="tile-label">Pedidos (30 días)</div><div className="tile-value">{int(a.orders_30d)}</div></div>
              <div className="tile"><div className="tile-label">Contactos (30 días)</div><div className="tile-value">{int(a.leads_30d)}</div></div>
            </div>

            <ActionForm action={setPlan.bind(null, a.id, u.id)} className="inline-form">
              <div className="field">
                <label className="label" htmlFor={`plan-${a.id}`}>Plan</label>
                <select className="select" id={`plan-${a.id}`} name="plan" defaultValue={a.plan}>
                  <option value="inicial">Inicial (gratis)</option>
                  <option value="pro">Pro</option>
                  <option value="negocio">Negocio</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor={`trial-${a.id}`}>Días de prueba</label>
                <input className="input" id={`trial-${a.id}`} name="trial" type="number" min={0} max={90} defaultValue={trialLeft} />
              </div>
              <Submit className="btn" pendingText="Guardando…">Guardar plan</Submit>
              <p className="hint wide">Con 0 días el plan queda activo sin vencimiento (por ejemplo, si te pagó por transferencia). Con prueba, al vencer vuelve a Inicial.</p>
            </ActionForm>

            <h3 className="sec-title">Páginas</h3>
            {a.pages.length === 0 ? <p className="hint">Esta cuenta todavía no tiene páginas.</p> : null}
            <div className="adm-pages">
              {a.pages.map((p) => (
                <article key={p.id} className="adm-page" id={`pagina-${p.id}`}>
                  <div className="adm-page-head">
                    <div className="grow">
                      <b>{p.name}</b>
                      <a className="mono sub" href={`/${p.slug}`} target="_blank" rel="noreferrer">{publicHost()}/{p.slug}</a>
                    </div>
                    <PageStatus status={p.status} />
                    <span className="muted nowrap">{int(p.visits_30d)} visitas en 30 días</span>
                  </div>
                  {p.status === 'suspendida' && p.moderation_note ? <p className="hint err">Motivo: {p.moderation_note}</p> : null}
                  <details className="details">
                    <summary>Moderar esta página</summary>
                    <div className="grid-f">
                      <ActionForm action={setPageStatus.bind(null, p.id, u.id)} className="stack">
                        <div className="field">
                          <label className="label" htmlFor={`st-${p.id}`}>Estado</label>
                          <select className="select" id={`st-${p.id}`} name="status" defaultValue={p.status}>
                            <option value="publicada">Publicada</option>
                            <option value="borrador">Borrador (no se ve)</option>
                            <option value="suspendida">Suspendida por moderación</option>
                          </select>
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`note-${p.id}`}>Motivo si la suspendés</label>
                          <input className="input" id={`note-${p.id}`} name="note" maxLength={300} defaultValue={p.moderation_note ?? ''} />
                        </div>
                        <div><Submit className="btn btn-sm" pendingText="Guardando…">Guardar estado</Submit></div>
                      </ActionForm>
                      <ActionForm action={changeSlug.bind(null, p.id, u.id)} className="stack">
                        <div className="field">
                          <label className="label" htmlFor={`slug-${p.id}`}>Link</label>
                          <div className="ig">
                            <span className="pre">{publicHost()}/</span>
                            <input id={`slug-${p.id}`} name="slug" defaultValue={p.slug} required minLength={3} maxLength={30} autoCapitalize="none" spellCheck={false} />
                          </div>
                          <p className="hint">Por ejemplo, ante un reclamo de marca. El link anterior deja de funcionar.</p>
                        </div>
                        <div><Submit className="btn btn-sm" pendingText="Cambiando…">Cambiar link</Submit></div>
                      </ActionForm>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </section>
        )
      })}

      {/* ---------- Solo superadmin ---------- */}
      {isSuper && !isSelf ? (
        <section className="card pad section is-danger" aria-labelledby="super">
          <div className="cc-head">
            <div>
              <h2 className="cc-title" id="super">Acciones de superadmin</h2>
              <p className="cc-sub">Cambios sensibles: quedan registrados con tu email</p>
            </div>
          </div>
          <div className="grid-f">
            <ActionForm action={changeUserEmail.bind(null, u.id)} className="stack">
              <div className="field">
                <label className="label" htmlFor="new-email">Cambiar email de ingreso</label>
                <input className="input" id="new-email" name="email" type="email" required autoComplete="off" placeholder="nuevo@email.com" />
                <p className="hint">Queda confirmado al instante. Hacelo solo si verificaste que la persona es la titular.</p>
              </div>
              <div><Submit className="btn btn-sm" pendingText="Cambiando…">Cambiar email</Submit></div>
            </ActionForm>
            <ActionForm action={setStaffRole.bind(null, u.id)} className="stack">
              <div className="field">
                <label className="label" htmlFor="role">Rol en el equipo de la plataforma</label>
                <select className="select" id="role" name="role" defaultValue={d.staff_role ?? ''}>
                  <option value="">Sin rol (usuario común)</option>
                  <option value="soporte">Soporte: ve todo y ayuda a usuarios</option>
                  <option value="superadmin">Superadmin: además borra, cambia emails y roles</option>
                </select>
              </div>
              <div><Submit className="btn btn-sm" pendingText="Guardando…">Guardar rol</Submit></div>
            </ActionForm>
          </div>
          <details className="details danger">
            <summary>Borrar usuario</summary>
            <ActionForm action={deleteUser.bind(null, u.id)} className="stack">
              <p className="hint">
                Borra el usuario y las cuentas donde es el único dueño, con sus páginas, productos, pedidos y contactos.
                <b> No se puede deshacer.</b> Si solo querés frenar su actividad, suspendé la cuenta.
              </p>
              <div className="field">
                <label className="label" htmlFor="confirm">Para confirmar, escribí su email: <span className="mono">{u.email}</span></label>
                <input className="input" id="confirm" name="confirm" type="text" required autoComplete="off" spellCheck={false} />
              </div>
              <div><Submit className="btn btn-danger" pendingText="Borrando…">Borrar para siempre</Submit></div>
            </ActionForm>
          </details>
        </section>
      ) : !isSuper ? (
        <p className="hint section">Cambiar el email de ingreso, asignar roles o borrar usuarios: solo superadmin.</p>
      ) : null}

      {/* ---------- Historial ---------- */}
      <section className="card pad section" aria-labelledby="historial">
        <div className="cc-head">
          <div>
            <h2 className="cc-title" id="historial">Historial del equipo</h2>
            <p className="cc-sub">Lo que hizo el equipo sobre este usuario, sus cuentas y sus páginas</p>
          </div>
        </div>
        {log?.length ? (
          <ul className="feed">
            {(log as LogRow[]).map((l) => {
              const target =
                l.target_type === 'page' ? pageName.get(l.target_id) : l.target_type === 'account' ? accountName.get(l.target_id) : null
              const detail = describeDetails(l.details)
              return (
                <li key={l.id} className="feed-it no-ico">
                  <span className="feed-main">
                    <span>{ACTION_LABEL[l.action] ?? l.action}{target ? ` · ${TARGET_LABEL[l.target_type] ?? ''} ${target}` : ''}</span>
                    <span className="muted">{l.actor_email ?? 'Sistema'}{detail ? ` · ${detail}` : ''}</span>
                  </span>
                  <span className="feed-time" title={dateTime(l.created_at)}>{ago(l.created_at)}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="cc-note">Todavía no hay acciones del equipo sobre este usuario.</p>
        )}
      </section>
    </>
  )
}
