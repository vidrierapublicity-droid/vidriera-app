'use client'
import { useActionState, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

export type ActionResult = { ok: boolean; message: string; link?: string } | null
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>

/** Formulario que llama a una Server Action y muestra el resultado debajo. */
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className={className}>
      {children}
      {state ? (
        <p className={state.ok ? 'hint ok' : 'hint err'} role="status" aria-live="polite">
          {state.message}
        </p>
      ) : null}
      {state?.link ? <CopyField value={state.link} /> : null}
    </form>
  )
}

export function Submit({
  children,
  className = 'btn',
  pendingText = 'Procesando…',
  disabled = false,
}: {
  children: ReactNode
  className?: string
  pendingText?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button className={className} type="submit" disabled={pending || disabled} aria-disabled={pending || disabled}>
      {pending ? pendingText : children}
    </button>
  )
}

export function CopyField({ value, label = 'Link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copyfield">
      <input className="input mono" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* el usuario puede copiarlo a mano desde el campo */
          }
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}
