import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE, clientIp, detectSource, deviceOf, rateLimited, visitorHash } from '@/lib/analytics'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const fail = (error: string, status = 422) => NextResponse.json({ error }, { status })

/** Formularios de la página pública y avisos de stock. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return fail('Formato inválido', 400)
  }

  // Campo trampa para bots: si viene completo, respondemos OK sin guardar
  if (text(body.hp, 200)) return NextResponse.json({ ok: true })

  const ip = clientIp(request.headers)
  if (rateLimited(`l:${ip}`, 6, 60_000)) return fail('Mandaste varios formularios seguidos. Esperá un minuto y probá de nuevo.', 429)

  const pageId = String(body.p ?? '')
  const blockId = String(body.b ?? '')
  const productId = String(body.pr ?? '')
  if (!UUID_RE.test(pageId)) return fail('Formulario inválido', 400)

  const name = text(body.name, 120)
  const email = text(body.email, 160).toLowerCase()
  const whatsapp = text(body.whatsapp, 40)
  const message = text(body.message, 1000)
  if (email && !EMAIL_RE.test(email)) return fail('Revisá el email: parece que falta algo.')
  if (whatsapp && whatsapp.replace(/\D/g, '').length < 8) return fail('Revisá el número de WhatsApp.')

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('id, account_id, status, accounts!inner(status)')
    .eq('id', pageId)
    .maybeSingle()
  const accountStatus = (page?.accounts as unknown as { status?: string } | null)?.status
  if (!page || page.status !== 'publicada' || accountStatus !== 'activa') return fail('Esta página no está disponible.', 404)

  let formLabel = ''
  let thanks = ''
  // Solo se guardan los campos que el formulario realmente pide
  let fields = { name: false, email: false, whatsapp: false, message: false }
  if (UUID_RE.test(blockId)) {
    const { data: block } = await admin
      .from('blocks')
      .select('id, type, visible, starts_at, ends_at, data')
      .eq('id', blockId)
      .eq('page_id', pageId)
      .maybeSingle()
    const now = Date.now()
    const onSchedule =
      block &&
      (!block.starts_at || new Date(block.starts_at).getTime() <= now) &&
      (!block.ends_at || new Date(block.ends_at).getTime() > now)
    if (!block || block.type !== 'form' || block.visible === false || !onSchedule) return fail('Este formulario no está disponible.', 404)
    const d = (block.data ?? {}) as { title?: string; thanks?: string; fields?: Partial<typeof fields> }
    fields = { name: Boolean(d.fields?.name), email: Boolean(d.fields?.email), whatsapp: Boolean(d.fields?.whatsapp), message: Boolean(d.fields?.message) }
    if (fields.name && !name) return fail('Escribí tu nombre.')
    const asksContact = fields.email || fields.whatsapp
    if (asksContact && !(fields.email && email) && !(fields.whatsapp && whatsapp)) {
      return fail(fields.email && fields.whatsapp ? 'Dejá un email o un WhatsApp para que te puedan responder.' : fields.email ? 'Escribí tu email.' : 'Escribí tu WhatsApp.')
    }
    if (!asksContact && !name && !message) return fail('Completá el formulario.')
    formLabel = d.title || 'Formulario'
    thanks = d.thanks || ''
  } else if (UUID_RE.test(productId)) {
    const { data: product } = await admin.from('products').select('id, name, active').eq('id', productId).eq('page_id', pageId).maybeSingle()
    if (!product || product.active === false) return fail('Este producto no está disponible.', 404)
    if (!email) return fail('Escribí tu email para avisarte.')
    fields = { name: false, email: true, whatsapp: false, message: false }
    formLabel = `Aviso de stock: ${product.name}`
  } else {
    return fail('Formulario inválido', 400)
  }

  const userAgent = request.headers.get('user-agent') || ''
  const source = detectSource(String(body.r ?? ''), String(body.q ?? ''), userAgent, request.nextUrl.hostname)

  const { error } = await admin.from('leads').insert({
    page_id: pageId,
    account_id: page.account_id,
    block_id: UUID_RE.test(blockId) ? blockId : null,
    product_id: UUID_RE.test(productId) ? productId : null,
    form_label: formLabel.slice(0, 120),
    name: (fields.name && name) || null,
    email: (fields.email && email) || null,
    whatsapp: (fields.whatsapp && whatsapp) || null,
    message: (fields.message && message) || null,
    source,
  })
  if (error) {
    console.error('No se pudo guardar el contacto', error)
    return fail('No pudimos enviar tus datos. Probá de nuevo en un rato.', 500)
  }

  await admin.from('events').insert({
    page_id: pageId,
    type: 'lead',
    block_id: UUID_RE.test(blockId) ? blockId : null,
    product_id: UUID_RE.test(productId) ? productId : null,
    source,
    visitor_hash: visitorHash(pageId, ip, userAgent),
    device: deviceOf(userAgent),
  })

  return NextResponse.json({ ok: true, thanks })
}
