import { createClient } from '@supabase/supabase-js'

/**
 * Cliente anónimo sin cookies, para leer páginas públicas.
 * Solo puede llamar a funciones abiertas como get_public_page.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
