/** URL pública de la app, sin barra final. */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return url.replace(/\/+$/, '')
}

/** Host que se muestra en los links de las páginas (vidriera.link/mika). */
export function publicHost(): string {
  return siteUrl().replace(/^https?:\/\//, '')
}

/**
 * Solo permite redirecciones internas ("/panel"), nunca a otros sitios.
 * Rechaza trucos como "//otro.com", "/\otro.com" o "/<tab>/otro.com"
 * (el navegador ignora tabs y saltos de línea en las URLs).
 */
export function safeNext(next: string | null | undefined, fallback = '/panel'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback
  try {
    const base = 'http://interno.invalid'
    const url = new URL(next, base)
    const path = url.pathname + url.search + url.hash
    // "/..//otro.com" se normaliza a "//otro.com": también se rechaza
    if (url.origin !== base || path.startsWith('//')) return fallback
    return path
  } catch {
    return fallback
  }
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https:\/\//.test(path)) return path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path.split('/').map(encodeURIComponent).join('/')}`
}
