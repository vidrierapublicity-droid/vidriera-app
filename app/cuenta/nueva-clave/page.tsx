import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/logo'
import { NewPasswordForm } from '@/components/auth-forms'
import { cameFromEmailLink, requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Contraseña nueva' }

export default async function NewPasswordPage() {
  const user = await requireUser('/cuenta/nueva-clave')
  const allowed = await cameFromEmailLink()
  return (
    <div className="auth-shell">
      <div className="auth-top"><Wordmark /></div>
      <main className="auth-card">
        <h1 className="auth-h">Creá tu contraseña nueva</h1>
        {allowed ? (
          <>
            <p className="auth-p">Para la cuenta {user.email}.</p>
            <NewPasswordForm />
          </>
        ) : (
          <>
            <p className="auth-p">
              Por seguridad, este paso funciona solo durante 30 minutos después de abrir el link que te mandamos por email.
            </p>
            <div className="row">
              <Link className="btn btn-primary" href="/panel/cuenta">Cambiarla desde Mi cuenta</Link>
              <Link className="btn" href="/recuperar">Pedir un link nuevo</Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
