import 'server-only'
import { createHash } from 'node:crypto'

export const EVENT_TYPES = new Set([
  'page_view', 'click', 'view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'contact', 'purchase', 'lead',
])
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegram|discord|headless|lighthouse/i

function fromLabel(s: string): string {
  if (/instagram|^ig$/.test(s)) return 'instagram'
  if (/tiktok|^tt$/.test(s)) return 'tiktok'
  if (/whatsapp|^wa$|(^|\.)wa\.me$/.test(s)) return 'whatsapp'
  if (/google/.test(s)) return 'google'
  return ''
}

/**
 * ¿De dónde llegó la visita? Primero utm_source, después el navegador
 * interno de Instagram/TikTok (que suele ocultar el referer) y por
 * último el sitio que la mandó.
 */
export function detectSource(referrer: string, query: string, userAgent: string, ownHost: string): string {
  let utm = ''
  try {
    utm = (new URLSearchParams(query).get('utm_source') || '').toLowerCase()
  } catch {
    /* query inválida */
  }
  if (utm) return fromLabel(utm) || 'otros'
  if (/Instagram/i.test(userAgent)) return 'instagram'
  if (/musical_ly|BytedanceWebview|TikTok/i.test(userAgent)) return 'tiktok'
  let host = ''
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : ''
  } catch {
    host = ''
  }
  if (!host || host === ownHost) return 'directo'
  return fromLabel(host) || 'otros'
}

export function deviceOf(userAgent: string): 'celular' | 'computadora' | 'tablet' {
  if (/iPad|Tablet/i.test(userAgent)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(userAgent)) return 'celular'
  return 'computadora'
}

/** Identificador anónimo que cambia cada día. La IP no se guarda. */
export function visitorHash(pageId: string, ip: string, userAgent: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${process.env.ANALYTICS_SALT ?? ''}|${day}|${pageId}|${ip}|${userAgent}`)
    .digest('hex')
    .slice(0, 20)
}

/**
 * IP del visitante, solo para el límite de envíos y el hash diario (no se guarda).
 * En Vercel la plataforma escribe x-real-ip; si tu hosting no la pone,
 * asegurate de que el proxy reescriba x-forwarded-for.
 */
export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip')?.trim() || (headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
}

export function geo(headers: Headers) {
  const decode = (v: string | null) => {
    if (!v) return null
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  return {
    country: headers.get('x-vercel-ip-country'),
    region: decode(headers.get('x-vercel-ip-country-region')),
    city: decode(headers.get('x-vercel-ip-city')),
  }
}

/** Límite simple por IP (en memoria, por instancia). En producción usá un KV. */
const hits = new Map<string, { n: number; until: number }>()
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.until < now) {
    hits.set(key, { n: 1, until: now + windowMs })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k)
    return false
  }
  entry.n += 1
  return entry.n > max
}
