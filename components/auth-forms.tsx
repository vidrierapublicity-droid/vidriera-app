'use client'
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { checkSlug, requestReset, signIn, signUp, type AuthState } from '@/app/(auth)/actions'
import { setNewPassword } from '@/app/cuenta/actions'
import { slugify } from '@/lib/slugs'
import { publicHost } from '@/lib/site'

function Submit({ children, pending }: { children: string; pending: string }) {
  const { pending: isPending } = useFormStatus()
  return (
    <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={isPending}>
      {isPending ? pending : children}
    </button>
  )
}

function Feedback({ state }: { state: AuthState }) {
  if (!state) return null
  if (state.error) return <p className="notice notice-err" role="alert">{state.error}</p>
  if (state.message) return <p className="notice notice-ok" role="status">{state.message}</p>
  return null
}

function PasswordInput({ id, name, autoComplete, label }: { id: string; name: string; autoComplete: string; label: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="ig">
        <input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} required minLength={8} maxLength={72} />
        <button type="button" className="ig-btn" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  )
}

/* ---------- Ingresar ---------- */
export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(signIn, null)
  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      {notice && !state ? <p className="notice notice-ok" role="status">{notice}</p> : null}
      <div className="field">
        <label className="label" htmlFor="login-email">Email</label>
        <input className="input" id="login-email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </div>
      <PasswordInput id="login-password" name="password" autoComplete="current-password" label="Contraseña" />
      <Feedback state={state} />
      <Submit pending="Ingresando…">Ingresar</Submit>
      <p className="auth-links">
        <Link href="/recuperar">Olvidé mi contraseña</Link>
        <span>¿No tenés cuenta? <Link href="/registro">Creala gratis</Link></span>
      </p>
    </form>
  )
}

/* ---------- Registro ---------- */
export function SignupForm() {
  const [state, action] = useActionState(signUp, null)
  const [brand, setBrand] = useState(state?.fields?.page_name ?? '')
  const [slug, setSlug] = useState(state?.fields?.slug ?? '')
  const [touched, setTouched] = useState(Boolean(state?.fields?.slug))
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!slug) { setCheck(null); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await checkSlug(slug)
      setCheck({ ok: r.ok, message: r.message })
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [slug])

  if (state?.message) {
    return (
      <div className="stack">
        <p className="notice notice-ok" role="status">{state.message}</p>
        <p className="hint">¿No llega? Revisá spam o promociones. Si pusiste mal el email, <Link href="/registro">volvé a empezar</Link>.</p>
      </div>
    )
  }

  return (
    <form action={action} className="stack">
      <div className="grid-f">
        <div className="field">
          <label className="label" htmlFor="su-name">Tu nombre</label>
          <input className="input" id="su-name" name="full_name" autoComplete="name" required maxLength={80} defaultValue={state?.fields?.full_name} />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-brand">Nombre de tu marca</label>
          <input
            className="input" id="su-brand" name="page_name" required maxLength={60} placeholder="Ej: Panadería Lola"
            value={brand}
            onChange={(e) => { setBrand(e.target.value); if (!touched) setSlug(slugify(e.target.value)) }}
          />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="su-slug">Tu link</label>
        <div className="ig">
          <span className="pre">{publicHost()}/</span>
          <input
            id="su-slug" name="slug" required maxLength={30} autoCapitalize="off" spellCheck={false} placeholder="tumarca"
            value={slug}
            onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)) }}
          />
        </div>
        {check ? <p className={`hint ${check.ok ? 'ok' : 'err'}`} aria-live="polite">{check.message}</p> : null}
      </div>
      <div className="field">
        <label className="label" htmlFor="su-email">Email</label>
        <input className="input" id="su-email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </div>
      <PasswordInput id="su-password" name="password" autoComplete="new-password" label="Contraseña (mínimo 8 caracteres)" />
      <div className="grid-f">
        <div className="field">
          <label className="label" htmlFor="su-goal">¿Para qué la vas a usar?</label>
          <select className="select" id="su-goal" name="goal" defaultValue={state?.fields?.goal ?? 'productos'}>
            <option value="productos">Vender productos</option>
            <option value="servicios">Ofrecer servicios o turnos</option>
            <option value="contenido">Compartir mi contenido</option>
            <option value="todo">Un poco de todo</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="su-theme">Diseño inicial</label>
          <select className="select" id="su-theme" name="theme" defaultValue={state?.fields?.theme ?? 'vidrio'}>
            <option value="vidrio">Vidrio</option>
            <option value="pizarra">Pizarra</option>
            <option value="esmalte">Esmalte</option>
            <option value="cartel">Cartel</option>
            <option value="terracota">Terracota</option>
            <option value="noche">Noche</option>
          </select>
        </div>
      </div>
      <Feedback state={state} />
      <Submit pending="Creando tu cuenta…">Crear mi vidriera</Submit>
      <p className="hint">Al crear la cuenta aceptás los términos y la política de privacidad. Tu contraseña se guarda cifrada: nadie puede verla, tampoco el equipo de Vidriera.</p>
      <p className="auth-links"><span>¿Ya tenés cuenta? <Link href="/ingresar">Ingresá</Link></span></p>
    </form>
  )
}

/* ---------- Recuperar contraseña ---------- */
export function ResetForm() {
  const [state, action] = useActionState(requestReset, null)
  return (
    <form action={action} className="stack">
      <div className="field">
        <label className="label" htmlFor="rs-email">Email de tu cuenta</label>
        <input className="input" id="rs-email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </div>
      <Feedback state={state} />
      <Submit pending="Enviando…">Mandarme el link</Submit>
      <p className="auth-links"><Link href="/ingresar">Volver a ingresar</Link></p>
    </form>
  )
}

/* ---------- Contraseña nueva (después del link del email) ---------- */
export function NewPasswordForm() {
  const [state, action] = useActionState(setNewPassword, null)
  return (
    <form action={action} className="stack">
      <PasswordInput id="np-password" name="password" autoComplete="new-password" label="Contraseña nueva" />
      <PasswordInput id="np-confirm" name="confirm" autoComplete="new-password" label="Repetila" />
      <Feedback state={state} />
      <Submit pending="Guardando…">Guardar contraseña</Submit>
    </form>
  )
}
