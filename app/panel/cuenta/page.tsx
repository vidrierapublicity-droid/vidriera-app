import type { Metadata } from 'next'
import { ActionForm, Submit } from '@/components/action-form'
import { changeEmail, changePassword, updateProfile } from '@/app/panel/actions'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function AccountPage() {
  const user = await requireUser('/panel/cuenta')
  const supabase = await createClient()
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from('profiles').select('full_name, created_at').eq('id', user.id).maybeSingle(),
    supabase.auth.getUser(),
  ])

  return (
    <>
      <div className="ph"><div><h1>Mi cuenta</h1><p className="ph-sub">Creada el {dateTime(profile?.created_at)}</p></div></div>
      <div className="stack narrow">
        <section className="card pad stack">
          <h2 className="card-title">Tu nombre</h2>
          <ActionForm action={updateProfile} className="stack">
            <div className="field"><label className="label" htmlFor="pf-name">Nombre</label><input className="input" id="pf-name" name="full_name" defaultValue={profile?.full_name ?? ''} maxLength={80} required /></div>
            <div><Submit>Guardar</Submit></div>
          </ActionForm>
        </section>

        <section className="card pad stack">
          <h2 className="card-title">Email</h2>
          <p className="hint">Ingresás con <b>{auth.user?.email}</b>. Para cambiarlo te mandamos un link de confirmación.</p>
          <ActionForm action={changeEmail} className="stack">
            <div className="field"><label className="label" htmlFor="pf-email">Email nuevo</label><input className="input" id="pf-email" name="email" type="email" autoComplete="email" required /></div>
            <div><Submit>Cambiar email</Submit></div>
          </ActionForm>
        </section>

        <section className="card pad stack">
          <h2 className="card-title">Contraseña</h2>
          <p className="hint">Se guarda cifrada. Nadie puede verla, ni siquiera el equipo de Vidriera. Si la olvidás, pedí un link para crear una nueva.</p>
          <ActionForm action={changePassword} className="stack">
            <div className="field"><label className="label" htmlFor="pw-current">Contraseña actual</label><input className="input" id="pw-current" name="current" type="password" autoComplete="current-password" required /></div>
            <div className="grid-f">
              <div className="field"><label className="label" htmlFor="pw-new">Contraseña nueva</label><input className="input" id="pw-new" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
              <div className="field"><label className="label" htmlFor="pw-confirm">Repetila</label><input className="input" id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></div>
            </div>
            <div><Submit>Cambiar contraseña</Submit></div>
          </ActionForm>
        </section>

        <section className="card pad stack">
          <h2 className="card-title">Sesiones</h2>
          <p className="hint">Si usaste tu cuenta en una computadora ajena o perdiste el celular, cerrá la sesión en todos lados.</p>
          <form action="/auth/salir" method="post">
            <input type="hidden" name="scope" value="global" />
            <button className="btn" type="submit">Cerrar sesión en todos los dispositivos</button>
          </form>
        </section>
      </div>
    </>
  )
}
