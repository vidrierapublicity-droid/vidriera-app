'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cameFromEmailLink } from '@/lib/auth'
import type { AuthState } from '@/app/(auth)/actions'

/**
 * Después del link de recuperación: la sesión ya existe y se fija la clave nueva.
 * Solo funciona si la sesión empezó con ese link hace menos de 30 minutos;
 * si no, alguien con una sesión abierta ajena podría cambiar la contraseña
 * sin saber la actual (para eso está «Mi cuenta», que la pide).
 */
export async function setNewPassword(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const password = String(fd.get('password') ?? '')
  const confirm = String(fd.get('confirm') ?? '')
  if (password.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' }
  if (password.length > 72) return { error: 'La contraseña puede tener hasta 72 caracteres.' }
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: 'El link venció. Pedí uno nuevo desde «Olvidé mi contraseña».' }
  if (!(await cameFromEmailLink())) {
    return {
      error:
        'Por seguridad, este paso funciona solo durante 30 minutos después de abrir el link del email. ' +
        'Pedí uno nuevo desde «Olvidé mi contraseña», o cambiala desde «Mi cuenta» con tu contraseña actual.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === 'same_password') return { error: 'La contraseña nueva tiene que ser distinta de la anterior.' }
    if (error.code === 'weak_password') return { error: 'Es muy fácil de adivinar. Probá con una más larga.' }
    return { error: 'No pudimos guardar la contraseña. Probá de nuevo.' }
  }
  redirect('/panel?clave=ok')
}
