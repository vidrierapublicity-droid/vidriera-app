import { digits } from '@/lib/format'

const clean = (h: string) => h.trim().replace(/^@/, '')

export const NETWORKS: Record<string, { label: string; url: (handle: string) => string }> = {
  instagram: { label: 'Instagram', url: (h) => `https://instagram.com/${clean(h)}` },
  tiktok: { label: 'TikTok', url: (h) => `https://www.tiktok.com/@${clean(h)}` },
  whatsapp: { label: 'WhatsApp', url: (h) => (digits(h) ? `https://wa.me/${digits(h)}` : '') },
  youtube: { label: 'YouTube', url: (h) => `https://youtube.com/@${clean(h)}` },
  facebook: { label: 'Facebook', url: (h) => `https://facebook.com/${clean(h)}` },
  web: { label: 'Sitio web', url: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`) },
  email: { label: 'Email', url: (h) => `mailto:${h.trim()}` },
}

/** Solo deja pasar http(s) y mailto. Nunca javascript: ni otros esquemas. */
export function safeUrl(u: string | null | undefined): string {
  const s = String(u ?? '').trim()
  if (/^https?:\/\//i.test(s)) return s
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`
  return ''
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const n = digits(phone)
  return n.length >= 8 ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''
}
