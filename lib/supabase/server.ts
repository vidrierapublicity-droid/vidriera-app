import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase con la sesión del usuario (cookies).
 * Usalo en Server Components, Server Actions y Route Handlers.
 * Todo lo que hace pasa por las políticas RLS de la base.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // No pasa nada porque proxy.ts refresca la sesión en cada pedido.
          }
        },
      },
    },
  )
}
