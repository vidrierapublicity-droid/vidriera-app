import type { ReactNode } from 'react'
import { Wordmark } from '@/components/logo'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-top"><Wordmark /></div>
      <main className="auth-card">{children}</main>
    </div>
  )
}
