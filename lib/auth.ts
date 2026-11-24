import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SessionUser = { id: string; email: string | null }
export type StaffRole = 'superadmin' | 'soporte'
export type StaffUser = SessionUser & { role: StaffRole }

/** Usuario con sesión válida (verifica la firma del token), o null. Rápido: para el panel. */
export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
}

/**
 * Usuario confirmado por el servidor de Auth en este mismo pedido.
 * A diferencia de getUser(), detecta sesiones cerradas desde el panel de
 * admin aunque el token todavía no haya vencido. Se usa para el staff.
 */
const getVerifiedUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
})

export async function requireUser(next = '/panel'): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect('/ingresar?next=' + encodeURIComponent(next))
  return user
}

/**
 * ¿Esta sesión empezó hace poco con un link enviado por email (recuperar
 * contraseña, confirmar cuenta)? Eso prueba que la persona controla el email,
 * así que puede elegir una contraseña nueva sin escribir la actual.
 * Supabase marca esas sesiones con el método "otp" en el claim `amr`.
 */
export async function cameFromEmailLink(maxAgeMinutes = 30): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const amr = (data?.claims as { amr?: unknown } | undefined)?.amr
  if (!Array.isArray(amr)) return false
  const now = Date.now() / 1000
  return amr.some((entry) => {
    const { method, timestamp } = (entry ?? {}) as { method?: unknown; timestamp?: unknown }
    return (
      (method === 'otp' || method === 'recovery' || method === 'magiclink') &&
      typeof timestamp === 'number' &&
      now - timestamp <= maxAgeMinutes * 60
    )
  })
}

/** Rol en el equipo de la plataforma. Se lee con la clave secreta. Si la consulta falla, lanza un error. */
export async function getStaffRole(userId: string): Promise<StaffRole | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('staff').select('role').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`No se pudo leer el rol del equipo: ${error.message}`)
  const role = data?.role
  return role === 'superadmin' || role === 'soporte' ? role : null
}

/** Para Server Actions: devuelve el staff o null (nunca redirige). */
export async function currentStaff(min: StaffRole = 'soporte'): Promise<StaffUser | null> {
  const user = await getVerifiedUser()
  if (!user) return null
  const role = await getStaffRole(user.id).catch(() => null)
  if (!role) return null
  if (min === 'superadmin' && role !== 'superadmin') return null
  return { ...user, role }
}

/** Para páginas del panel de admin: si no sos staff, la ruta "no existe". */
export async function requireStaff(min: StaffRole = 'soporte'): Promise<StaffUser> {
  const user = await getVerifiedUser()
  if (!user) redirect('/ingresar?next=/admin')
  const staff = await currentStaff(min)
  if (!staff) notFound()
  return staff
}
