import { PLAN_LABEL } from '@/lib/types'

const PAGE: Record<string, [string, string]> = {
  publicada: ['Publicada', 't-good'],
  borrador: ['Borrador', 't-neutral'],
  suspendida: ['Suspendida', 't-bad'],
}

export function PageStatus({ status }: { status: string }) {
  const [label, tone] = PAGE[status] ?? [status, 't-neutral']
  return <span className={`pill ${tone}`}>{label}</span>
}

export function AccountStatus({ status, banned }: { status: string | null; banned?: boolean }) {
  if (status === 'suspendida' || banned) return <span className="pill t-bad">Suspendida</span>
  return <span className="pill t-good">Activa</span>
}

export function PlanPill({ plan, trialEndsAt }: { plan: string | null; trialEndsAt?: string | null }) {
  if (!plan) return <span className="pill t-neutral">Sin cuenta</span>
  const trial = trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()
  return (
    <span className={`pill ${plan === 'inicial' ? 't-neutral' : 't-info'}`}>
      {PLAN_LABEL[plan] ?? plan}
      {trial ? ' · prueba' : ''}
    </span>
  )
}
