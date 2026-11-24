import type { Metadata } from 'next'
import { ResetForm } from '@/components/auth-forms'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function ResetPage() {
  return (
    <>
      <h1 className="auth-h">Recuperá tu contraseña</h1>
      <p className="auth-p">Te mandamos un link para crear una nueva. Por seguridad, nadie puede ver tu contraseña actual.</p>
      <ResetForm />
    </>
  )
}
