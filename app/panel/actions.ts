'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { friendlyDbError } from '@/lib/errors'
import { siteUrl } from '@/lib/site'
import { slugProblem, slugify } from '@/lib/slugs'
import type { ActionResult } from '@/components/action-form'

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? '').trim().slice(0, max)
const expired: ActionResult = { ok: false, message: 'Tu sesión venció. Ingresá de nuevo.' }

/** Datos básicos de una página: nombre, descripción, ubicación, link y publicación. */
export async function updatePageBasics(pageId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await getUser())) return expired
  const slug = slugify(str(fd, 'slug', 60))
  const problem = slugProblem(slug)
  if (problem) return { ok: false, message: `Revisá el link: ${problem}` }

  const supabase = await createClient()
  const { data: current } = await supabase.from('pages').select('status, slug').eq('id', pageId).maybeSingle()
  if (!current) return { ok: false, message: 'No encontramos esa página en tu cuenta.' }

  const update: Record<string, unknown> = {
    name: str(fd, 'name', 60),
    bio: str(fd, 'bio', 160),
    location: str(fd, 'location', 60),
    slug,
  }
  if (current.status !== 'suspendida') update.status = fd.get('published') === 'on' ? 'publicada' : 'borrador'

  const { error } = await supabase.from('pages').update(update).eq('id', pageId)
  if (error) return { ok: false, message: friendlyDbError(error) }
  revalidatePath('/panel')
  revalidatePath(`/${slug}`)
  if (current.slug !== slug) revalidatePath(`/${current.slug}`)
  return { ok: true, message: 'Cambios guardados.' }
}

export async function createPage(accountId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await getUser())) return expired
  const slug = slugify(str(fd, 'slug', 60))
  const problem = slugProblem(slug)
  if (problem) return { ok: false, message: `Revisá el link: ${problem}` }
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_page', {
    p_account: accountId,
    p_slug: slug,
    p_name: str(fd, 'name', 60) || slug,
    p_goal: str(fd, 'goal', 20) || 'todo',
    p_theme: str(fd, 'theme', 20) || 'vidrio',
  })
  if (error) return { ok: false, message: friendlyDbError(error, 'No pudimos crear la página.') }
  revalidatePath('/panel')
  return { ok: true, message: `Listo: creaste ${slug}.` }
}

export async function updateProfile(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getUser()
  if (!user) return expired
  const fullName = str(fd, 'full_name', 80)
  if (!fullName) return { ok: false, message: 'Escribí tu nombre.' }
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  if (error) return { ok: false, message: friendlyDbError(error) }
  revalidatePath('/panel', 'layout')
  return { ok: true, message: 'Guardado.' }
}

/** Pide la contraseña actual antes de cambiarla. */
export async function changePassword(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const current = String(fd.get('current') ?? '')
  const next = String(fd.get('password') ?? '')
  const confirm = String(fd.get('confirm') ?? '')
  if (next.length < 8) return { ok: false, message: 'La contraseña nueva tiene que tener al menos 8 caracteres.' }
  if (next !== confirm) return { ok: false, message: 'Las contraseñas nuevas no coinciden.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) return expired

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (authError) return { ok: false, message: 'La contraseña actual no es correcta.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) {
    if (error.code === 'same_password') return { ok: false, message: 'La contraseña nueva tiene que ser distinta de la actual.' }
    if (error.code === 'weak_password') return { ok: false, message: 'Es muy fácil de adivinar. Probá con una más larga.' }
    return { ok: false, message: 'No pudimos cambiar la contraseña. Probá de nuevo.' }
  }
  return { ok: true, message: 'Listo, cambiaste tu contraseña.' }
}

export async function changeEmail(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = str(fd, 'email', 160).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: 'Revisá el email nuevo.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/panel/cuenta` })
  if (error) {
    if (error.code === 'email_exists') return { ok: false, message: 'Ese email ya está en uso en otra cuenta.' }
    return { ok: false, message: 'No pudimos iniciar el cambio. Probá de nuevo.' }
  }
  return { ok: true, message: `Te mandamos un link a ${email} para confirmar el cambio. Hasta que lo confirmes, seguís ingresando con tu email actual.` }
}
