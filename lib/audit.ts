import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SessionUser } from '@/lib/auth'

type Target = 'user' | 'account' | 'page' | 'order' | 'lead' | 'staff'

/**
 * Deja registro de cada acción del equipo. Nunca guarda contraseñas ni links de acceso.
 * Devuelve false si no se pudo guardar, para que las acciones sensibles se frenen.
 */
export async function audit(
  actor: SessionUser,
  action: string,
  targetType: Target,
  targetId: string,
  details: Record<string, unknown> = {},
): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.from('audit_log').insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  })
  if (error) {
    console.error('No se pudo registrar la auditoría', error)
    return false
  }
  return true
}
