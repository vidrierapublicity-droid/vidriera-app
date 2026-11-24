export const ACTION_LABEL: Record<string, string> = {
  enviar_link_contraseña: 'Envió un link para cambiar la contraseña',
  generar_link_contraseña: 'Generó un link de recuperación',
  cerrar_sesiones: 'Cerró todas las sesiones',
  confirmar_email: 'Confirmó el email a mano',
  suspender_usuario: 'Suspendió la cuenta',
  reactivar_usuario: 'Reactivó la cuenta',
  cambiar_email: 'Cambió el email de ingreso',
  cambiar_rol_staff: 'Cambió el rol en el equipo',
  asignar_staff: 'Asignó un rol del equipo',
  borrar_usuario: 'Borró el usuario',
  cambiar_plan: 'Cambió el plan',
  estado_pagina: 'Cambió el estado de una página',
  cambiar_link: 'Cambió el link de una página',
}

export const TARGET_LABEL: Record<string, string> = {
  user: 'Usuario', account: 'Cuenta', page: 'Página', order: 'Pedido', lead: 'Contacto', staff: 'Equipo',
}

const KEY_LABEL: Record<string, string> = {
  email: 'email', reason: 'motivo', note: 'motivo', cuentas: 'cuentas', cuentas_borradas: 'cuentas borradas',
  antes: 'antes', despues: 'después', role: 'rol', plan: 'plan', dias_prueba: 'días de prueba',
  status: 'estado', sesiones: 'sesiones', origen: 'origen', quitado_del_equipo: 'quitado del equipo',
  archivos_borrados: 'archivos borrados', problemas: 'problemas', error: 'error',
}

/** Resume los detalles de una acción en una línea legible. */
export function describeDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined || v === '') continue
    const key = KEY_LABEL[k] ?? k
    if (Array.isArray(v)) {
      if (v.length) parts.push(`${key}: ${v.length}`)
      continue
    }
    parts.push(`${key}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  }
  return parts.join(' · ')
}
