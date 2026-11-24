import Link from 'next/link'
import { Wordmark } from '@/components/logo'

export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-top"><Wordmark /></div>
      <main className="auth-card" style={{ textAlign: 'center' }}>
        <h1 className="auth-h">Esta vidriera no existe</h1>
        <p className="auth-p">Puede que el link esté mal escrito o que la página ya no esté publicada.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" href="/registro">Crear la mía</Link>
          <Link className="btn" href="/">Ir al inicio</Link>
        </div>
      </main>
    </div>
  )
}
