'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Enlace del menú lateral que se marca cuando estás en esa sección. */
export function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname() ?? ''
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  return (
    <Link className={`nav-a ${active ? 'is-on' : ''}`} href={href} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}
