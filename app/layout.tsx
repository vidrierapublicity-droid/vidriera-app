import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Bricolage_Grotesque, DM_Mono, Figtree } from 'next/font/google'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz', 'wdth'], variable: '--nf-display', display: 'swap' })
const ui = Figtree({ subsets: ['latin'], variable: '--nf-ui', display: 'swap' })
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--nf-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Vidriera', template: '%s · Vidriera' },
  description: 'Tu vidriera en un link: enlaces, catálogo, cobros y pedidos por WhatsApp en una sola página.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
