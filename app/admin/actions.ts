'use server'
/**
 * Acciones del panel de administración.
 * Cada una: (1) verifica en el servidor que quien la pide es staff (con una
 * consulta al servidor de Auth, no solo el token), (2) usa la clave secreta
 * solo para esa operación, (3) se frena ante cualquier error de la base y
 * (4) deja registro en la auditoría. Ninguna muestra ni guarda contraseñas.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentStaff, getStaffRole, type StaffRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { friendlyDbError } from '@/lib/errors'
import { siteUrl } from '@/lib/site'
import { slugProblem, slugify } from '@/lib/slugs'
import type { ActionResult } from '@/components/action-form'

const DENIED: ActionResult = { ok: false, message: 'No tenés permiso para esta acción.' }
const INVALID: ActionResult = { ok: false, message: 'Pedido inválido.' }
const str = (fd: FormData, key: string, max = 300) => String(fd.get(key) ?? '').trim().slice(0, max)
const BAN_FOREVER = '876000h' // 100 años
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

type Admin = ReturnType<typeof createAdminClient>

async function emailOf(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user?.email) return null
  return data.user.email
}

/**
 * Un miembro de soporte no puede tocar el acceso de otra persona del equipo.
 * Si no se puede averiguar el rol (error de la base), se bloquea por las dudas.
 */
async function protectsStaff(me: { role: StaffRole }, userId: string): Promise<ActionResult | null> {
  if (me.role === 'superadmin') return null
  try {
    const role = await getStaffRole(userId)
    return role ? { ok: false, message: 'Solo un superadmin puede gestionar el acceso de alguien del equipo.' } : null
  } catch {
    return { ok: false, message: 'No se pudo verificar el rol de esa persona. Probá de nuevo.' }
  }
}

function refresh(userId?: string | null) {
  revalidatePath('/admin', 'layout')
  if (userId) revalidatePath(`/admin/usuarios/${userId}`)
}

/** Cuentas de las que la persona es dueña. */
async function ownedAccounts(admin: Admin, userId: string): Promise<string[]> {
  const { data, error } = await admin.from('account_members').select('account_id').eq('user_id', userId).eq('role', 'owner')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { account_id: string }[]).map((r) => r.account_id)
}

/** Lista los archivos de una carpeta del Storage (con subcarpetas). */
async function listMedia(admin: Admin, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  const { data, error } = await admin.storage.from('media').list(prefix, { limit: 1000 })
  if (error || !data) return []
  const files: string[] = []
  for (const item of data as { name: string; id: string | null }[]) {
    const path = `${prefix}/${item.name}`
    if (item.id === null) files.push(...(await listMedia(admin, path, depth + 1)))
    else files.push(path)
  }
  return files
}

/* ---------------- Contraseñas y acceso ---------------- */

/** Le manda a la persona un email para crear una contraseña nueva. */
export async function sendPasswordReset(userId: string, _prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  const blocked = await protectsStaff(me, userId)
  if (blocked) return blocked
  const email = await emailOf(userId)
  if (!email) return { ok: false, message: 'Ese usuario no tiene un email cargado.' }
  const admin = createAdminClient()
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/cuenta/nueva-clave`,
  })
  if (error) return { ok: false, message: `No se pudo enviar el email: ${error.message}` }
  await audit(me, 'enviar_link_contraseña', 'user', userId, { email })
  return { ok: true, message: `Listo: enviamos a ${email} un link para crear una contraseña nueva.` }
}

/**
 * Genera el mismo link sin mandar email, para pasárselo a la persona por
 * otro canal (por ejemplo, WhatsApp) si el email no le llega.
 * Quien abra el link entra a la cuenta: por eso primero se registra en la
 * auditoría y, si eso falla, no se genera.
 */
export async function generateRecoveryLink(userId: string, _prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  const blocked = await protectsStaff(me, userId)
  if (blocked) return blocked
  const email = await emailOf(userId)
  if (!email) return { ok: false, message: 'Ese usuario no tiene un email cargado.' }
  const logged = await audit(me, 'generar_link_contraseña', 'user', userId, { email })
  if (!logged) return { ok: false, message: 'No se pudo registrar la acción en la auditoría, así que no se generó el link. Probá de nuevo.' }
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) return { ok: false, message: `No se pudo generar el link: ${error?.message ?? 'sin token'}` }
  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=/cuenta/nueva-clave`
  return {
    ok: true,
    message: 'Link generado. Sirve una sola vez y vence en 1 hora. Mandáselo solo a la persona titular de la cuenta y no lo abras vos.',
    link,
  }
}

/** Cierra todas las sesiones abiertas (obliga a volver a ingresar). */
export async function revokeSessions(userId: string, _prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  const blocked = await protectsStaff(me, userId)
  if (blocked) return blocked
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_revoke_sessions', { p_user: userId })
  if (error) return { ok: false, message: `No se pudieron cerrar las sesiones: ${error.message}` }
  await audit(me, 'cerrar_sesiones', 'user', userId, { sesiones: data })
  return { ok: true, message: `Listo: se cerraron ${data ?? 0} sesiones. Los accesos abiertos se cortan en menos de una hora.` }
}

/**
 * Marca el email como confirmado, por ejemplo si el email de confirmación
 * nunca llegó y la persona escribió a soporte desde esa casilla.
 * Al confirmarse, la base publica las páginas que quedaron en borrador en el registro.
 */
export async function confirmUserEmail(userId: string, _prev: ActionResult, _fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  const blocked = await protectsStaff(me, userId)
  if (blocked) return blocked
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  if (error) return { ok: false, message: `No se pudo confirmar: ${error.message}` }
  await audit(me, 'confirmar_email', 'user', userId)
  refresh(userId)
  return { ok: true, message: 'Email confirmado. Si tenía páginas en borrador del registro, ya se publicaron.' }
}

/**
 * Suspende o reactiva. Suspender: oculta todas las páginas de sus cuentas,
 * bloquea el ingreso, le quita el rol del equipo (si tenía) y cierra sus sesiones.
 */
export async function setUserSuspended(userId: string, suspend: boolean, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  if (userId === me.id) return { ok: false, message: 'No podés suspender tu propia cuenta.' }
  const blocked = await protectsStaff(me, userId)
  if (blocked) return blocked
  const reason = str(fd, 'reason')
  if (suspend && !reason) return { ok: false, message: 'Escribí el motivo: queda en la auditoría y en la cuenta.' }

  const admin = createAdminClient()
  let accountIds: string[]
  try {
    accountIds = await ownedAccounts(admin, userId)
  } catch (err) {
    return { ok: false, message: `No se pudieron leer sus cuentas: ${(err as Error).message}` }
  }

  // 1) Ocultar (o volver a mostrar) sus páginas
  if (accountIds.length) {
    const { error } = await admin
      .from('accounts')
      .update({ status: suspend ? 'suspendida' : 'activa', suspended_reason: suspend ? reason : null })
      .in('id', accountIds)
    if (error) return { ok: false, message: `No se pudieron actualizar sus cuentas: ${error.message}. No se cambió nada.` }
  }

  // 2) Bloquear (o habilitar) el ingreso
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: suspend ? BAN_FOREVER : 'none' })
  if (banError) {
    await audit(me, suspend ? 'suspender_usuario' : 'reactivar_usuario', 'user', userId, { reason: reason || undefined, cuentas: accountIds, error: banError.message })
    refresh(userId)
    return {
      ok: false,
      message: `Sus páginas ${suspend ? 'se ocultaron' : 'volvieron a verse'}, pero no se pudo ${suspend ? 'bloquear' : 'habilitar'} el ingreso (${banError.message}). Probá de nuevo.`,
    }
  }

  // 3) Al suspender: quitar el rol del equipo y cerrar sesiones
  let removedRole: StaffRole | null = null
  const problems: string[] = []
  if (suspend) {
    try {
      removedRole = await getStaffRole(userId)
      if (removedRole) {
        const { error } = await admin.from('staff').delete().eq('user_id', userId)
        if (error) {
          problems.push(`no se pudo quitar su rol del equipo (${error.message})`)
          removedRole = null
        }
      }
    } catch (err) {
      problems.push(`no se pudo revisar su rol del equipo (${(err as Error).message})`)
    }
    const { error: revokeError } = await admin.rpc('admin_revoke_sessions', { p_user: userId })
    if (revokeError) problems.push(`no se pudieron cerrar sus sesiones (${revokeError.message})`)
  }

  await audit(me, suspend ? 'suspender_usuario' : 'reactivar_usuario', 'user', userId, {
    reason: reason || undefined,
    cuentas: accountIds,
    quitado_del_equipo: removedRole ?? undefined,
    problemas: problems.length ? problems.join('; ') : undefined,
  })
  refresh(userId)
  if (problems.length) return { ok: false, message: `Cuenta ${suspend ? 'suspendida' : 'reactivada'}, pero ${problems.join(' y ')}. Probá de nuevo.` }
  return {
    ok: true,
    message: suspend
      ? `Cuenta suspendida: no puede ingresar y sus páginas dejaron de verse.${removedRole ? ` También perdió el rol «${removedRole}».` : ''}`
      : 'Cuenta reactivada: puede ingresar y sus páginas vuelven a verse.',
  }
}

/** Cambia el email de ingreso (solo superadmin). Queda confirmado. */
export async function changeUserEmail(userId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff('superadmin')
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  const email = str(fd, 'email', 160).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: 'Revisá el email nuevo.' }
  const before = await emailOf(userId)
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (error) {
    if (error.code === 'email_exists') return { ok: false, message: 'Ese email ya lo usa otra cuenta.' }
    return { ok: false, message: `No se pudo cambiar: ${error.message}` }
  }
  await audit(me, 'cambiar_email', 'user', userId, { antes: before, despues: email })
  refresh(userId)
  return { ok: true, message: `Listo: ahora ingresa con ${email}.` }
}

/** Da o quita permisos de staff (solo superadmin). */
export async function setStaffRole(userId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff('superadmin')
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  if (userId === me.id) return { ok: false, message: 'No podés cambiar tu propio rol desde acá.' }
  const role = str(fd, 'role', 20)
  if (role !== '' && role !== 'soporte' && role !== 'superadmin') return { ok: false, message: 'Elegí un rol válido.' }
  const admin = createAdminClient()
  if (role) {
    const { error } = await admin.from('staff').upsert({ user_id: userId, role })
    if (error) return { ok: false, message: friendlyDbError(error) }
  } else {
    const { error } = await admin.from('staff').delete().eq('user_id', userId)
    if (error) return { ok: false, message: friendlyDbError(error) }
  }
  await audit(me, 'cambiar_rol_staff', 'staff', userId, { role: role || 'ninguno' })
  refresh(userId)
  return { ok: true, message: role ? `Rol actualizado: ${role}.` : 'Ya no es parte del equipo.' }
}

/**
 * Borra el usuario y las cuentas de las que es único dueño, con sus páginas,
 * productos, pedidos, contactos y fotos (solo superadmin).
 */
export async function deleteUser(userId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff('superadmin')
  if (!me) return DENIED
  if (!isUuid(userId)) return INVALID
  if (userId === me.id) return { ok: false, message: 'No podés borrar tu propia cuenta desde acá.' }
  try {
    if (await getStaffRole(userId)) return { ok: false, message: 'Primero quitale el rol del equipo.' }
  } catch {
    return { ok: false, message: 'No se pudo verificar su rol del equipo. Probá de nuevo.' }
  }
  const email = await emailOf(userId)
  if (!email || str(fd, 'confirm', 160).toLowerCase() !== email.toLowerCase()) {
    return { ok: false, message: 'Para confirmar, escribí exactamente el email del usuario.' }
  }

  const admin = createAdminClient()
  const soleOwned: string[] = []
  try {
    for (const accountId of await ownedAccounts(admin, userId)) {
      const { count, error } = await admin
        .from('account_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('role', 'owner')
      if (error) throw new Error(error.message)
      if ((count ?? 0) <= 1) soleOwned.push(accountId)
    }
  } catch (err) {
    return { ok: false, message: `No se pudieron revisar sus cuentas: ${(err as Error).message}. No se borró nada.` }
  }

  // Fotos de las páginas que se van a borrar
  let removedFiles = 0
  if (soleOwned.length) {
    const { data: pages } = await admin.from('pages').select('id').in('account_id', soleOwned)
    for (const page of (pages ?? []) as { id: string }[]) {
      const files = await listMedia(admin, `pages/${page.id}`)
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await admin.storage.from('media').remove(files.slice(i, i + 100))
        if (!error) removedFiles += Math.min(100, files.length - i)
      }
    }
  }

  // Registro antes de borrar, para que quede el email
  const logged = await audit(me, 'borrar_usuario', 'user', userId, { email, cuentas_borradas: soleOwned, archivos_borrados: removedFiles })
  if (!logged) return { ok: false, message: 'No se pudo registrar la acción en la auditoría, así que no se borró nada. Probá de nuevo.' }
  if (soleOwned.length) {
    const { error } = await admin.from('accounts').delete().in('id', soleOwned)
    if (error) return { ok: false, message: `No se pudieron borrar las cuentas: ${error.message}` }
  }
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { ok: false, message: `Se borraron sus cuentas, pero no el usuario: ${error.message}` }
  refresh()
  redirect('/admin/usuarios?aviso=borrado')
}

/* ---------------- Planes y páginas ---------------- */

export async function setPlan(accountId: string, userId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(accountId)) return INVALID
  const plan = str(fd, 'plan', 20)
  if (!['inicial', 'pro', 'negocio'].includes(plan)) return { ok: false, message: 'Elegí un plan válido.' }
  const trialDays = Math.max(0, Math.min(90, Math.floor(Number(str(fd, 'trial', 3)) || 0)))
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('accounts')
    .update({ plan, trial_ends_at: trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : null })
    .eq('id', accountId)
    .select('id')
  if (error) return { ok: false, message: friendlyDbError(error) }
  if (!data?.length) return { ok: false, message: 'No existe esa cuenta.' }
  await audit(me, 'cambiar_plan', 'account', accountId, { plan, dias_prueba: trialDays })
  refresh(isUuid(userId) ? userId : null)
  return { ok: true, message: trialDays ? `Plan ${plan} con ${trialDays} días de prueba.` : `Plan actualizado a ${plan}.` }
}

/** Publicar, pasar a borrador o suspender una página (moderación). */
export async function setPageStatus(pageId: string, userId: string | null, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(pageId)) return INVALID
  const status = str(fd, 'status', 20)
  if (!['publicada', 'borrador', 'suspendida'].includes(status)) return { ok: false, message: 'Estado inválido.' }
  const note = str(fd, 'note')
  if (status === 'suspendida' && !note) return { ok: false, message: 'Escribí el motivo de la suspensión. El dueño lo ve en su panel.' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pages')
    .update({ status, moderation_note: status === 'suspendida' ? note : null })
    .eq('id', pageId)
    .select('id, slug')
  if (error) return { ok: false, message: friendlyDbError(error) }
  if (!data?.length) return { ok: false, message: 'No existe esa página.' }
  await audit(me, 'estado_pagina', 'page', pageId, { status, note: note || undefined })
  refresh(isUuid(userId) ? userId : null)
  if (data[0].slug) revalidatePath(`/${data[0].slug}`)
  return { ok: true, message: status === 'suspendida' ? 'Página suspendida.' : `Página en estado «${status}».` }
}

/** Cambiar el link de una página (por ejemplo, por un reclamo de marca). */
export async function changeSlug(pageId: string, userId: string | null, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await currentStaff()
  if (!me) return DENIED
  if (!isUuid(pageId)) return INVALID
  const slug = slugify(str(fd, 'slug', 60))
  const problem = slugProblem(slug)
  if (problem) return { ok: false, message: problem }
  const admin = createAdminClient()
  const { data: page, error: readError } = await admin.from('pages').select('slug').eq('id', pageId).maybeSingle()
  if (readError) return { ok: false, message: friendlyDbError(readError) }
  if (!page) return { ok: false, message: 'No existe esa página.' }
  if (page.slug === slug) return { ok: true, message: 'Ya tenía ese link.' }
  const { data: available, error: checkError } = await admin.rpc('slug_available', { p_slug: slug })
  if (checkError) return { ok: false, message: friendlyDbError(checkError) }
  if (!available) return { ok: false, message: 'Ese link ya está en uso o está reservado.' }
  const { error } = await admin.from('pages').update({ slug }).eq('id', pageId)
  if (error) return { ok: false, message: friendlyDbError(error) }
  await audit(me, 'cambiar_link', 'page', pageId, { antes: page.slug, despues: slug })
  refresh(isUuid(userId) ? userId : null)
  revalidatePath(`/${page.slug}`)
  revalidatePath(`/${slug}`)
  return { ok: true, message: `Link cambiado: ahora es /${slug}. El anterior deja de funcionar.` }
}
