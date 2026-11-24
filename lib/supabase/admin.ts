import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con la clave SECRETA: saltea RLS y puede usar la API de
 * administración de usuarios (auth.admin). Solo en el servidor y solo
 * después de verificar que quien pide la acción tiene permiso.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en las variables de entorno.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
