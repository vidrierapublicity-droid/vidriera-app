import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth-forms'
import { safeNext } from '@/lib/site'

export const metadata: Metadata = { title: 'Ingresar' }

const NOTICES: Record<string, string> = {
  link: 'El link venció o ya se usó. Pedí uno nuevo desde «Olvidé mi contraseña».',
  salida: 'Cerraste sesión.',
  clave: 'Tu contraseña se cambió. Ingresá con la nueva.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const next = safeNext(typeof sp.next === 'string' ? sp.next : '/panel')
  const aviso = typeof sp.aviso === 'string' ? NOTICES[sp.aviso] : undefined
  return (
    <>
      <h1 className="auth-h">Ingresá a tu vidriera</h1>
      <p className="auth-p">Con el email y la contraseña con los que te registraste.</p>
      <LoginForm next={next} notice={aviso} />
    </>
  )
}
