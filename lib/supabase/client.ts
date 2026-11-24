'use client'
import { createBrowserClient } from '@supabase/ssr'

/** Cliente para componentes de navegador (por ejemplo, subir fotos al Storage). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
