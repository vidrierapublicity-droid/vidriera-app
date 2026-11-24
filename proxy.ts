import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16: este archivo reemplaza a middleware.ts
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Rutas que usan la sesión. Las páginas públicas (/<link>) no pasan por acá.
  matcher: ['/', '/panel/:path*', '/admin/:path*', '/cuenta/:path*', '/ingresar', '/registro', '/api/editor/:path*'],
}
