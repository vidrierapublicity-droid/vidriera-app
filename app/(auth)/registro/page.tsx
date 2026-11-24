import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth-forms'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default function SignupPage() {
  return (
    <>
      <h1 className="auth-h">Creá tu vidriera</h1>
      <p className="auth-p">Gratis para empezar. Tu cuenta arranca con 14 días del plan Pro.</p>
      <SignupForm />
    </>
  )
}
