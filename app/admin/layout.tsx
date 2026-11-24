import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/logo'
import { Icon } from '@/components/icons'
import { NavLink } from '@/components/nav-link'
import { requireStaff } from '@/lib/auth'

export const metadata: Metadata = { title: { default: 'Administración', template: '%s · Admin Vidriera' }, robots: { index: false } }

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff()
  const nav = (
    <>
      <NavLink href="/admin" exact><Icon name="chart" /><span>Resumen</span></NavLink>
      <NavLink href="/admin/usuarios"><Icon name="users" /><span>Usuarios</span></NavLink>
      <NavLink href="/admin/paginas"><Icon name="store" /><span>Páginas</span></NavLink>
      <NavLink href="/admin/auditoria"><Icon name="list" /><span>Auditoría</span></NavLink>
    </>
  )
  return (
    <div className="shell admin">
      <aside className="side" aria-label="Administración">
        <Wordmark href="/admin" />
        <p className="admin-badge"><Icon name="shield" />Administración</p>
        <nav className="nav" aria-label="Secciones">{nav}</nav>
        <div className="side-foot">
          <div className="acct">
            <span className="acct-main"><b>{staff.email}</b><span className="muted">Rol: {staff.role}</span></span>
          </div>
          <a className="btn btn-sm" href="/panel">Volver a mi panel</a>
        </div>
      </aside>
      <div className="mtop">
        <div className="mtop-row"><Wordmark href="/admin" /><a className="btn btn-sm" href="/panel">Mi panel</a></div>
        <nav className="mnav" aria-label="Secciones">{nav}</nav>
      </div>
      <main className="main">{children}</main>
    </div>
  )
}
