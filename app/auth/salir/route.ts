import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Cerrar sesión (formulario POST). scope=global cierra todos los dispositivos. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const everywhere = form?.get('scope') === 'global'
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' })
  return NextResponse.redirect(new URL('/ingresar?aviso=salida', request.url), { status: 303 })
}
