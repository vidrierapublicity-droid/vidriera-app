import Link from 'next/link'

/** Marca: un toldo de vidriera de cuatro franjas. */
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 18" aria-hidden="true" focusable="false">
      <path d="M2 2h7v8a3.5 3.5 0 0 1-7 0Z" style={{ fill: 'var(--brand)' }} />
      <path d="M9 2h7v8a3.5 3.5 0 0 1-7 0Z" style={{ fill: 'var(--awning-alt)' }} />
      <path d="M16 2h7v8a3.5 3.5 0 0 1-7 0Z" style={{ fill: 'var(--brand)' }} />
      <path d="M23 2h7v8a3.5 3.5 0 0 1-7 0Z" style={{ fill: 'var(--awning-alt)' }} />
      <path
        d="M2 2h28v8a3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0 3.5 3.5 0 0 1-7 0Z"
        fill="none"
        style={{ stroke: 'var(--ink)' }}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link className="wordmark" href={href}>
      <LogoMark />
      <span>Vidriera</span>
    </Link>
  )
}
