const moneyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const intFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const dayFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
const dateTimeFmt = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
})

export const money = (n: number | string | null | undefined) => moneyFmt.format(Math.round(Number(n) || 0))
export const int = (n: number | string | null | undefined) => intFmt.format(Math.round(Number(n) || 0))
export const pct = (x: number, digits = 1) =>
  (Number.isFinite(x) ? x * 100 : 0).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%'
export const day = (d: string | number | Date | null | undefined) => (d ? dayFmt.format(new Date(d)) : '—')
export const dateTime = (d: string | number | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : '—')

export function ago(d: string | number | Date | null | undefined): string {
  if (!d) return 'nunca'
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'recién'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 2 * 86400) return 'ayer'
  if (s < 30 * 86400) return `hace ${Math.floor(s / 86400)} días`
  return day(d)
}

export const initials = (name: string | null | undefined) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'V'
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase()
}

export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
