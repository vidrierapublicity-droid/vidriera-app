import type { ReactNode } from 'react'
import { Wordmark } from '@/components/logo'
import { Icon } from '@/components/icons'
import { NavLink } from '@/components/nav-link'
import { getStaffRole, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { initials } from '@/lib/format'

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('/panel')
  const supabase = await createClient()
  const [{ data: profile }, role] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    getStaffRole(user.id).catch(() => null),
  ])
  const name = profile?.full_name || user.email || 'Mi cuenta'

  const nav = (
    <>
      <NavLink href="/panel" exact><Icon name="store" /><span>Mis páginas</span></NavLink>
      <NavLink href="/panel/cuenta"><Icon name="key" /><span>Mi cuenta</span></NavLink>
      {role ? <NavLink href="/admin"><Icon name="shield" /><span>Administración</span></NavLink> : null}
    </>
  )

  return (
    <div className="shell">
      <aside className="side" aria-label="Panel">
        <Wordmark href="/panel" />
        <nav className="nav" aria-label="Secciones">{nav}</nav>
        <div className="side-foot">
          <div className="acct">
            <span className="acct-av">{initials(name)}</span>
            <span className="acct-main"><b>{name}</b><span className="muted">{user.email}</span></span>
          </div>
          <form action="/auth/salir" method="post">
            <button className="btn btn-sm btn-ghost" type="submit"><Icon name="logout" /><span>Salir</span></button>
          </form>
        </div>
      </aside>
      <div className="mtop">
        <div className="mtop-row">
          <Wordmark href="/panel" />
          <form action="/auth/salir" method="post"><button className="btn btn-sm" type="submit">Salir</button></form>
        </div>
        <nav className="mnav" aria-label="Secciones">{nav}</nav>
      </div>
      <main className="main">{children}</main>
    </div>
  )
}
