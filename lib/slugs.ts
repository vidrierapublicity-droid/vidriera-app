export const SLUG_RE = /^[a-z0-9._]{3,30}$/

/** "Mika Cerámica!" -> "mikaceramica" (misma regla que public.slugify en la base) */
export function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._]+/g, '')
    .slice(0, 30)
}

export function slugProblem(slug: string): string | null {
  if (!slug) return 'Elegí cómo va a terminar tu link.'
  if (slug.length < 3) return 'Usá al menos 3 caracteres.'
  if (!SLUG_RE.test(slug)) return 'Solo letras, números, puntos y guiones bajos.'
  return null
}
