#!/usr/bin/env node
/**
 * Da permisos de administración a un usuario que ya se registró.
 *
 *   npm run admin:crear -- tu@email.com              → superadmin
 *   npm run admin:crear -- persona@email.com soporte → soporte
 *   npm run admin:crear -- persona@email.com quitar  → deja de ser staff
 *
 * Usa la clave secreta de .env.local. Queda registrado en la auditoría.
 */
import { createClient } from '@supabase/supabase-js'

const [emailArg, roleArg = 'superadmin'] = process.argv.slice(2)
const ROLES = ['superadmin', 'soporte', 'quitar']
if (!emailArg || !ROLES.includes(roleArg)) {
  console.error('Uso: npm run admin:crear -- tu@email.com [superadmin|soporte|quitar]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function findUserByEmail(email) {
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (found) return found
    if (data.users.length < 1000) return null
  }
  return null
}

try {
  const user = await findUserByEmail(emailArg)
  if (!user) {
    console.error(`No hay ningún usuario con el email ${emailArg}.`)
    console.error('Primero registrate en /registro (y confirmá el email); después volvé a correr este comando.')
    process.exit(1)
  }

  if (roleArg !== 'quitar' && !user.email_confirmed_at) {
    console.error(`${user.email} todavía no confirmó su email. Confirmalo primero (así nadie puede registrar tu email antes que vos y quedarse con el rol).`)
    process.exit(1)
  }

  if (roleArg === 'quitar') {
    const { error } = await admin.from('staff').delete().eq('user_id', user.id)
    if (error) throw error
  } else {
    const { error } = await admin.from('staff').upsert({ user_id: user.id, role: roleArg })
    if (error) throw error
  }

  await admin.from('audit_log').insert({
    actor_id: null,
    actor_email: 'script:crear-admin',
    action: 'asignar_staff',
    target_type: 'staff',
    target_id: user.id,
    details: { email: user.email, role: roleArg === 'quitar' ? 'ninguno' : roleArg, origen: 'script' },
  })

  if (roleArg === 'quitar') console.log(`Listo: ${user.email} ya no es parte del equipo.`)
  else console.log(`Listo: ${user.email} ahora es ${roleArg}. Ingresá y andá a /admin.`)
} catch (err) {
  console.error('No se pudo completar:', err?.message ?? err)
  process.exit(1)
}
