import type { ReactNode } from 'react'
import { Caprasimo, Permanent_Marker, Young_Serif } from 'next/font/google'

// Tipografías extra de los temas (Editorial, Retro y Cartel)
const young = Young_Serif({ weight: '400', subsets: ['latin'], variable: '--nf-young', display: 'swap' })
const caprasimo = Caprasimo({ weight: '400', subsets: ['latin'], variable: '--nf-caprasimo', display: 'swap' })
const marker = Permanent_Marker({ weight: '400', subsets: ['latin'], variable: '--nf-marker', display: 'swap' })

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className={`${young.variable} ${caprasimo.variable} ${marker.variable}`}>{children}</div>
}
