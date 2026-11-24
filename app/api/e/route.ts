import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BOT_RE, EVENT_TYPES, UUID_RE, clientIp, detectSource, deviceOf, geo, rateLimited, visitorHash } from '@/lib/analytics'

/** Solo se cuentan visitas de páginas publicadas (cada página se consulta como mucho una vez por minuto). */
const liveCache = new Map<string, { live: boolean; until: number }>()
async function isLive(admin: ReturnType<typeof createAdminClient>, pageId: string): Promise<boolean> {
  const now = Date.now()
  const hit = liveCache.get(pageId)
  if (hit && hit.until > now) return hit.live
  const { data, error } = await admin.from('pages').select('status, accounts!inner(status)').eq('id', pageId).maybeSingle()
  if (error) return true // ante una falla de la base, mejor no perder la visita
  const accountStatus = (data?.accounts as unknown as { status?: string } | null)?.status
  const live = Boolean(data && data.status === 'publicada' && accountStatus === 'activa')
  liveCache.set(pageId, { live, until: now + 60_000 })
  if (liveCache.size > 5000) for (const [k, v] of liveCache) if (v.until < now) liveCache.delete(k)
  return live
}

/**
 * Recibe los eventos de la página pública (visitas y clics).
 * No guarda IP ni datos personales: solo un hash diario del visitante.
 */
export async function POST(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''
  if (BOT_RE.test(userAgent)) return new NextResponse(null, { status: 204 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  }

  const pageId = String(body.p ?? '')
  const type = String(body.t ?? '')
  if (!UUID_RE.test(pageId) || !EVENT_TYPES.has(type)) {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
  }

  const ip = clientIp(request.headers)
  if (rateLimited(`e:${ip}`, 120, 60_000)) return new NextResponse(null, { status: 204 })

  const blockId = String(body.b ?? '')
  const productId = String(body.pr ?? '')
  const value = body.v === undefined || body.v === null ? null : Number(body.v)

  const admin = createAdminClient()
  if (!(await isLive(admin, pageId))) return new NextResponse(null, { status: 204 })
  const { error } = await admin.from('events').insert({
    page_id: pageId,
    type,
    block_id: UUID_RE.test(blockId) ? blockId : null,
    product_id: UUID_RE.test(productId) ? productId : null,
    source: detectSource(String(body.r ?? ''), String(body.q ?? ''), userAgent, request.nextUrl.hostname),
    visitor_hash: visitorHash(pageId, ip, userAgent),
    device: deviceOf(userAgent),
    ...geo(request.headers),
    value: value !== null && Number.isFinite(value) ? value : null,
  })
  // 23503 = la página no existe: se ignora en silencio
  if (error && error.code !== '23503') console.error('No se pudo guardar el evento', error)
  return new NextResponse(null, { status: 204 })
}
