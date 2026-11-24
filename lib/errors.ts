type PgError = { code?: string; message?: string } | null | undefined

/** Traduce errores de la base a mensajes para la persona usuaria. */
export function friendlyDbError(error: PgError, fallback = 'No pudimos guardar los cambios. Probá de nuevo.'): string {
  if (!error) return fallback
  switch (error.code) {
    case '23505':
      return 'Ese link ya está en uso. Probá con otro.'
    case '23514':
      // Nuestras validaciones (link reservado) traen su propio mensaje en español
      return error.message && !error.message.startsWith('new row') ? error.message : 'Algún dato no tiene el formato esperado.'
    case '42501':
      return error.message && !/permission denied/i.test(error.message) ? error.message : 'No tenés permiso para hacer esto.'
    case 'P0001':
    case '22023':
      return error.message || fallback
    default:
      return fallback
  }
}
