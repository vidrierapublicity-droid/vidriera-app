import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/errors'
import { UUID_RE } from '@/lib/analytics'

type Ctx = { params: Promise<{ pageId: string }> }

/**
 * API del editor (la usa el editor visual de la etapa 2).
 * GET  → documento completo de la página (datos, bloques y productos)
 * PUT  → guarda el documento entero en una transacción (función save_page)
 * Corre con la sesión del usuario: la base decide si puede o no.
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { pageId } = await params
  if (!UUID_RE.test(pageId)) return NextResponse.json({ error: 'Página inválida' }, { status: 400 })
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_page_doc', { p_page: pageId })
  if (error) return NextResponse.json({ error: friendlyDbError(error, 'No se pudo cargar la página.') }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No encontramos esa página en tu cuenta.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { pageId } = await params
  if (!UUID_RE.test(pageId)) return NextResponse.json({ error: 'Página inválida' }, { status: 400 })

  let doc: unknown
  try {
    doc = await request.json()
  } catch {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray((doc as { blocks?: unknown }).blocks)) {
    return NextResponse.json({ error: 'Falta la lista de bloques.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: before } = await supabase.from('pages').select('slug').eq('id', pageId).maybeSingle()

  const { data, error } = await supabase.rpc('save_page', { p_page: pageId, p_doc: doc })
  if (error) {
    const status = error.code === '42501' ? 403 : ['P0001', '22023', '23514', '23505', '22P02'].includes(error.code ?? '') ? 422 : 500
    return NextResponse.json({ error: friendlyDbError(error) }, { status })
  }

  // Refresca al instante la página pública (y el link viejo, si cambió).
  const newSlug = (data as { page?: { slug?: string } })?.page?.slug
  if (newSlug) revalidatePath(`/${newSlug}`)
  if (before?.slug && before.slug !== newSlug) revalidatePath(`/${before.slug}`)

  return NextResponse.json(data)
}
