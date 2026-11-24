import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/panel', '/admin', '/cuenta']
const GUEST_ONLY = ['/ingresar', '/registro']

const startsWith = (path: string, base: string) => path === base || path.startsWith(base + '/')

/**
 * Refresca la sesión en cada pedido y protege las rutas privadas.
 * Importante: no pongas código entre createServerClient y getClaims().
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers?: Record<string, string>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // Las versiones nuevas de @supabase/ssr mandan encabezados para que
          // ningún CDN guarde en caché una respuesta con cookies de sesión.
          if (headers) Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const path = request.nextUrl.pathname

  const redirectTo = (pathname: string, next?: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    if (next) url.searchParams.set('next', next)
    const redirect = NextResponse.redirect(url)
    // Conserva las cookies de sesión recién refrescadas
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!signedIn && PROTECTED.some((base) => startsWith(path, base))) {
    return redirectTo('/ingresar', path + request.nextUrl.search)
  }
  if (signedIn && GUEST_ONLY.some((base) => startsWith(path, base))) {
    return redirectTo('/panel')
  }
  return response
}
