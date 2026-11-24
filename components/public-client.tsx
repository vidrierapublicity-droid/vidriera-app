'use client'
import { useEffect, useState, type FormEvent } from 'react'
import type { FormData_ } from '@/lib/types'
import { Icon } from '@/components/icons'

/* ---------- origen de la visita (se guarda para toda la sesión) ---------- */
const key = (pageId: string) => `vid:origen:${pageId}`

export function visitOrigin(pageId: string): { r: string; q: string } {
  const fresh = { r: typeof document !== 'undefined' ? document.referrer : '', q: typeof location !== 'undefined' ? location.search : '' }
  try {
    const saved = sessionStorage.getItem(key(pageId))
    if (saved) return JSON.parse(saved) as { r: string; q: string }
    sessionStorage.setItem(key(pageId), JSON.stringify(fresh))
  } catch {
    /* modo privado o almacenamiento bloqueado */
  }
  return fresh
}

export function sendEvent(pageId: string, type: string, extra: Record<string, string | number | undefined> = {}) {
  const body = JSON.stringify({ p: pageId, t: type, ...extra, ...visitOrigin(pageId) })
  try {
    if (navigator.sendBeacon?.('/api/e', new Blob([body], { type: 'application/json' }))) return
  } catch {
    /* sigue con fetch */
  }
  fetch('/api/e', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {})
}

const counted = new Set<string>()

/** Registra la visita y los clics en elementos con data-ev. */
export function Tracker({ pageId }: { pageId: string }) {
  useEffect(() => {
    if (!counted.has(pageId)) {
      counted.add(pageId)
      sendEvent(pageId, 'page_view')
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ev]')
      if (!el) return
      sendEvent(pageId, el.dataset.ev || 'click', { b: el.dataset.b, pr: el.dataset.pr })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [pageId])
  return null
}

async function postLead(payload: Record<string, unknown>) {
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; thanks?: string }
  if (!res.ok) throw new Error(json.error || 'No se pudo enviar. Probá de nuevo.')
  return json
}

/* ---------- formularios de contacto ---------- */
export function LeadForm({ pageId, blockId, data }: { pageId: string; blockId: string; data: FormData_ }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const f = data.fields ?? {}
  const id = (k: string) => `f-${blockId}-${k}`

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState('sending')
    setError('')
    try {
      await postLead({
        p: pageId, b: blockId,
        name: fd.get('name'), email: fd.get('email'), whatsapp: fd.get('whatsapp'), message: fd.get('message'),
        hp: fd.get('website'),
        ...visitOrigin(pageId),
      })
      setState('sent')
    } catch (err) {
      setState('idle')
      setError(err instanceof Error ? err.message : 'No se pudo enviar.')
    }
  }

  if (state === 'sent') {
    return (
      <section className="pp-card" aria-live="polite">
        <p className="pp-ok"><Icon name="check" /><span>{data.thanks || '¡Gracias! Recibimos tus datos.'}</span></p>
      </section>
    )
  }
  return (
    <form className="pp-card" onSubmit={onSubmit}>
      <h2 className="pp-card-title">{data.title || 'Escribinos'}</h2>
      {data.desc ? <p className="pp-card-desc">{data.desc}</p> : null}
      <input className="pp-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {f.name ? (<><label className="sr" htmlFor={id('name')}>Nombre</label><input className="pp-input" id={id('name')} name="name" placeholder="Nombre" autoComplete="name" required maxLength={120} /></>) : null}
      {f.email ? (<><label className="sr" htmlFor={id('email')}>Email</label><input className="pp-input" id={id('email')} name="email" type="email" placeholder="Email" autoComplete="email" required={!f.whatsapp} maxLength={160} /></>) : null}
      {f.whatsapp ? (<><label className="sr" htmlFor={id('wa')}>WhatsApp</label><input className="pp-input" id={id('wa')} name="whatsapp" type="tel" placeholder="WhatsApp" autoComplete="tel" required={!f.email} maxLength={40} /></>) : null}
      {f.message ? (<><label className="sr" htmlFor={id('msg')}>Mensaje</label><textarea className="pp-input" id={id('msg')} name="message" placeholder="Mensaje" rows={3} maxLength={1000} /></>) : null}
      {error ? <p className="pp-err" role="alert">{error}</p> : null}
      <button className="pp-btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : data.button || 'Enviar'}</button>
    </form>
  )
}

/* ---------- aviso de stock ---------- */
export function StockNotify({ pageId, productId }: { pageId: string; productId: string }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  if (state === 'sent') return <p className="pp-mini-ok"><Icon name="check" />Te avisamos cuando vuelva</p>
  if (!open) return <button type="button" className="pp-mini" onClick={() => setOpen(true)}><Icon name="mail" />Avisame cuando vuelva</button>

  return (
    <form
      className="pp-notify"
      onSubmit={async (e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setState('sending')
        setError('')
        try {
          await postLead({ p: pageId, pr: productId, email: fd.get('email'), hp: fd.get('website'), ...visitOrigin(pageId) })
          setState('sent')
        } catch (err) {
          setState('idle')
          setError(err instanceof Error ? err.message : 'No se pudo enviar.')
        }
      }}
    >
      <input className="pp-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="sr" htmlFor={`n-${productId}`}>Tu email</label>
      <input className="pp-input" id={`n-${productId}`} name="email" type="email" required placeholder="Tu email" autoComplete="email" />
      <button className="pp-btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? '…' : 'Avisame'}</button>
      {error ? <p className="pp-err" role="alert">{error}</p> : null}
    </form>
  )
}
