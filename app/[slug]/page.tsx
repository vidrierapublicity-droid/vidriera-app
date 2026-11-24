import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { PublicPage } from '@/components/public-page'
import { SLUG_RE } from '@/lib/slugs'
import { mediaUrl } from '@/lib/site'
import type { PublicPageData } from '@/lib/types'

// Se cachea hasta 5 minutos para que las visitas no peguen contra la base
// cada vez. El editor, el panel y el admin fuerzan una actualización al
// instante (revalidatePath) apenas guardan un cambio; los 5 minutos son
// solo el resguardo para el caso en que la página cambie desde la base
// sin pasar por esas rutas (por ejemplo, al confirmar el email).
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

const loadPage = cache(async (slug: string): Promise<PublicPageData | null> => {
  let clean = ''
  try {
    clean = decodeURIComponent(slug).toLowerCase()
  } catch {
    return null
  }
  if (!SLUG_RE.test(clean)) return null
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_public_page', { p_slug: clean })
  if (error) throw new Error(`No se pudo cargar la página: ${error.message}`)
  return (data as PublicPageData | null) ?? null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await loadPage(slug)
  if (!data) return { title: 'Página no encontrada' }
  const { page } = data
  const title = page.settings?.seoTitle || page.name || page.slug
  const description = page.settings?.seoDesc || page.bio || undefined
  const image = mediaUrl(page.avatar_path)
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images: image ? [image] : undefined, type: 'website' },
  }
}

export default async function PublicPageRoute({ params }: Props) {
  const { slug } = await params
  const data = await loadPage(slug)
  if (!data) notFound()
  return <PublicPage data={data} />
}
