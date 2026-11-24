'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNext, siteUrl } from '@/lib/site'
import { slugProblem, slugify } from '@/lib/slugs'

export type AuthState = { error?: string; message?: string; fields?: Record<string, string> } | null

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? '').trim().slice(0, max)
const GOALS = ['productos', 'servicios', 'contenido', 'todo']
const THEMES = ['vidrio', 'pizarra', 'esmalte', 'cartel', 'terracota', 'noche']

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd, 'email').toLowerCase()
  const password = String(fd.get('password') ?? '')
  const next = safeNext(str(fd, 'next', 300))
  if (!email || !password) return { error: 'Completá tu email y tu contraseña.', fields: { email } }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Todavía no confirmaste tu email. Buscá el mensaje de Vidriera (mirá también en spam).', fields: { email } }
    }
    if (error.code === 'user_banned') {
      return { error: 'Tu cuenta está suspendida. Escribinos a soporte para revisarla.', fields: { email } }
    }
    return { error: 'Email o contraseña incorrectos.', fields: { email } }
  }
  redirect(next)
}

export async function checkSlug(raw: string): Promise<{ ok: boolean; slug: string; message: string }> {
  const slug = slugify(raw)
  const problem = slugProblem(slug)
  if (problem) return { ok: false, slug, message: problem }
  const supabase = await createClient()
  const { data } = await supabase.rpc('slug_available', { p_slug: slug })
  return data
    ? { ok: true, slug, message: `¡Disponible! Tu página va a ser ${siteUrl().replace(/^https?:\/\//, '')}/${slug}` }
    : { ok: false, slug, message: 'Ese link ya está en uso o está reservado. Probá con otro.' }
}

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const fullName = str(fd, 'full_name', 80)
  const pageName = str(fd, 'page_name', 60)
  const slug = slugify(str(fd, 'slug', 60))
  const email = str(fd, 'email', 160).toLowerCase()
  const password = String(fd.get('password') ?? '')
  const goal = GOALS.includes(str(fd, 'goal')) ? str(fd, 'goal') : 'productos'
  const theme = THEMES.includes(str(fd, 'theme')) ? str(fd, 'theme') : 'vidrio'
  const fields = { full_name: fullName, page_name: pageName, slug, email, goal, theme }

  if (!fullName || !pageName) return { error: 'Completá tu nombre y el nombre de tu marca.', fields }
  const problem = slugProblem(slug)
  if (problem) return { error: `Revisá tu link: ${problem}`, fields }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Revisá el email.', fields }
  if (password.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.', fields }

  const supabase = await createClient()
  const { data: available } = await supabase.rpc('slug_available', { p_slug: slug })
  if (!available) return { error: 'Ese link ya está en uso o está reservado. Probá con otro.', fields }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/panel`,
      data: { full_name: fullName, page_name: pageName, slug, goal, theme },
    },
  })
  if (error) {
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return { error: 'Ya hay una cuenta con ese email. Ingresá o recuperá tu contraseña.', fields }
    }
    if (error.code === 'weak_password') {
      return { error: 'La contraseña es muy fácil de adivinar. Probá con una más larga o con más variedad.', fields }
    }
    if (error.code === 'over_email_send_rate_limit') {
      return { error: 'Se enviaron muchos emails seguidos. Esperá unos minutos y probá de nuevo.', fields }
    }
    return { error: 'No pudimos crear la cuenta. Probá de nuevo en un rato.', fields }
  }
  // Si la confirmación por email está desactivada, ya hay sesión
  if (data.session) redirect('/panel?bienvenida=1')
  return { message: `Te mandamos un email a ${email}. Tocá el botón del mensaje para confirmar tu cuenta y publicar tu página.` }
}

export async function requestReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd, 'email', 160).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Revisá el email.', fields: { email } }
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/confirm?next=/cuenta/nueva-clave` })
  // Mismo mensaje exista o no la cuenta: así nadie puede averiguar qué emails están registrados
  return { message: 'Si hay una cuenta con ese email, te llega un link para crear una contraseña nueva. Vence en 1 hora.' }
}
