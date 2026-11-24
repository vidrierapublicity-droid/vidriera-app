import Link from 'next/link'
import { Wordmark } from '@/components/logo'
import { getUser } from '@/lib/auth'

// Portada mínima. La landing completa del prototipo se porta en la etapa 2.
export default async function Home() {
  const user = await getUser()
  return (
    <div className="home wrap">
      <header className="home-nav">
        <Wordmark />
        <nav className="row">
          {user ? (
            <Link className="btn btn-ink btn-sm" href="/panel">Ir a mi panel</Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" href="/ingresar">Ingresar</Link>
              <Link className="btn btn-ink btn-sm" href="/registro">Crear cuenta</Link>
            </>
          )}
        </nav>
      </header>
      <main className="home-hero">
        <p className="eyebrow">Link en bio para vender</p>
        <h1 className="home-h1">Tu vidriera en <span className="u">un link.</span></h1>
        <p className="lede">Enlaces, catálogo, cobros y pedidos por WhatsApp en una sola página. Y estadísticas que te muestran qué publicación trajo cada venta.</p>
        <div className="row" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary btn-lg" href="/registro">Crear mi vidriera</Link>
          <Link className="btn btn-lg" href="/mika">Ver una página de ejemplo</Link>
        </div>
      </main>
    </div>
  )
}
