# Vidriera · backend, base de datos y panel de administración

App real (Next.js 16 + Supabase) detrás del prototipo navegable. Incluye:

- **Base de datos Postgres** con seguridad por filas (RLS) en todas las tablas: cuentas, páginas, bloques, productos, pedidos, contactos, analítica anónima y auditoría.
- **Registro, ingreso y recuperación de contraseña** con Supabase Auth.
- **Panel del usuario** (`/panel`): sus páginas, números de los últimos 30 días, contactos y pedidos recientes, datos de la cuenta.
- **Panel de administración** (`/admin`): usuarios, páginas, planes, suspensiones, contraseñas y auditoría.
- **Página pública** (`/<link>`) rápida, renderizada en el servidor, con registro de visitas y formularios.
- **Pruebas de seguridad** de la base (`supabase/tests/seguridad.sql`, 56 comprobaciones).

---

## Cómo funcionan los usuarios y las contraseñas

**Las contraseñas nunca se guardan ni se muestran.** Supabase Auth guarda solo un *hash* (bcrypt) en su propio esquema `auth`, al que la app no accede. Ni vos ni nadie del equipo puede ver una contraseña ni escribir una por el usuario. Eso es a propósito: si alguien entrara a tu panel, igual no podría llevarse contraseñas.

| Situación | Qué pasa |
|---|---|
| Alguien se registra en `/registro` | Se crea el usuario, su perfil, una **cuenta** (plan Pro con 14 días de prueba) y su **página** a partir de una plantilla. La página queda en borrador hasta que confirma el email. |
| Confirma el email | La página se publica sola. |
| Se olvidó la contraseña | Pide un link en `/recuperar` → le llega un email → el link (sirve una vez, vence en 1 hora) la lleva a `/cuenta/nueva-clave`, donde tiene 30 minutos para elegir la nueva. |
| Quiere cambiarla estando adentro | En **Mi cuenta**, escribiendo primero la contraseña actual. |
| Perdió el celular | En **Mi cuenta** → “Cerrar sesión en todos los dispositivos”. |

La sesión viaja en cookies que maneja `@supabase/ssr`, con un token firmado: si alguien lo modifica, deja de valer. `proxy.ts` la refresca en cada pedido y el servidor verifica la firma (`getClaims`) antes de mostrar algo privado. Para el panel de administración se consulta además al servidor de Auth en cada pedido, así una sesión cerrada o una cuenta suspendida pierde el acceso al instante.

### Qué podés hacer vos desde `/admin` cuando alguien no puede entrar

En la ficha de cada usuario (**Usuarios → clic en la persona**), sección *Acceso y contraseña*:

1. **Mandar email para crear contraseña nueva.** Le llega el mismo link que si lo pidiera ella.
2. **Generar link de recuperación.** Si el email no le llega, generás el link y se lo mandás por otro canal (por ejemplo, WhatsApp). Ojo: quien abra ese link entra a la cuenta, así que mandáselo solo a la persona titular y no lo abras vos.
3. **Cerrar todas las sesiones.** La obliga a volver a ingresar en todos lados.
4. **Confirmar el email a mano**, si el email de confirmación nunca llegó.

Todo queda registrado en **Auditoría** con tu email, fecha y detalle. Los links generados no se guardan en ningún lado.

### Roles del equipo

| Acción | Soporte | Superadmin |
|---|:---:|:---:|
| Ver usuarios, páginas, números y auditoría | ✓ | ✓ |
| Mandar link de contraseña, generar link, cerrar sesiones, confirmar email | ✓ (salvo a gente del equipo) | ✓ |
| Suspender y reactivar cuentas | ✓ (salvo a gente del equipo) | ✓ |
| Cambiar plan y días de prueba | ✓ | ✓ |
| Moderar páginas (publicar, borrador, suspender) y cambiar su link | ✓ | ✓ |
| Cambiar el email de ingreso de alguien | | ✓ |
| Dar o quitar roles del equipo | | ✓ |
| Borrar usuarios (con sus cuentas y páginas) | | ✓ |

Si alguien sin rol entra a `/admin`, ve una página de “no existe”. Los permisos se validan en el servidor en cada acción, no solo en los botones.

**Suspender** a alguien bloquea su ingreso, cierra sus sesiones, oculta todas sus páginas y, si era del equipo, le quita el rol; el motivo queda en la cuenta y en la auditoría. **Reactivar** devuelve el ingreso y las páginas (el rol del equipo hay que volver a darlo a mano). Una página suspendida no se puede borrar ni recrear con el mismo link. Para frenar una sola página (por ejemplo, por un reclamo), usá *Moderar esta página*.

---

## Puesta en marcha

Necesitás Node.js 20.9 o más nuevo y una cuenta en [Supabase](https://supabase.com).

### 1. Crear el proyecto en Supabase

Creá dos proyectos: uno para desarrollo y otro para producción (así los datos de prueba nunca se mezclan con los reales). Al crear el de **producción**, elegí la región **South America (São Paulo)**: es la más cercana a usuarios en Argentina y no se puede cambiar después de creado. En cada uno, andá a **Project Settings → API Keys** y copiá la URL, la *publishable key* y la *secret key*.

### 2. Crear las tablas

Con la CLI de Supabase:

```bash
npx supabase login
npx supabase link --project-ref TU_PROYECTO
npx supabase db push
```

O a mano: abrí **SQL Editor** y ejecutá, en orden, `supabase/migrations/20260925000100_esquema.sql` y `supabase/migrations/20260925000200_archivos.sql`.

### 3. Configurar Auth

En **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` en el proyecto de desarrollo; tu dominio (por ejemplo `https://vidriera.link`) en producción.
- **Redirect URLs:** agregá `http://localhost:3000/**` y `https://tu-dominio/**`.

En **Authentication → Emails → Templates**, reemplazá estas tres plantillas por las de `supabase/templates/` (usan `token_hash`, así los links funcionan aunque la persona los abra en otro dispositivo):

| Plantilla de Supabase | Archivo | Asunto sugerido |
|---|---|---|
| Confirm signup | `confirmar.html` | Confirmá tu cuenta de Vidriera |
| Reset password | `recuperar.html` | Creá una contraseña nueva |
| Change email address | `cambio-email.html` | Confirmá tu nuevo email |

**SMTP propio (obligatorio para producción).** Sin SMTP propio, Supabase solo manda emails a las direcciones del equipo del proyecto y con un límite muy bajo por hora. Configurá un proveedor (Resend, Postmark, Amazon SES, Brevo…) en **Authentication → Emails → SMTP Settings**.

Recomendado también: contraseña de mínimo 8 caracteres, protección contra contraseñas filtradas (si tu plan la incluye) y *Secure email change* activado.

### 4. Variables de entorno

```bash
cp .env.example .env.local
```

Completá los valores. `SUPABASE_SECRET_KEY` es la llave maestra: va solo en `.env.local` y en las variables de entorno del servidor, nunca en Git ni en código del navegador. `ANALYTICS_SALT` es un texto largo al azar (por ejemplo, la salida de `openssl rand -hex 32`).

### 5. Instalar y arrancar

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`, registrate y confirmá el email.

### 6. Hacerte administrador

```bash
npm run admin:crear -- tu@email.com
```

Tu email tiene que estar confirmado (así nadie puede registrarlo antes que vos y quedarse con el rol). Volvé a entrar y vas a ver **Administración** en el menú. Para sumar a alguien de soporte: `npm run admin:crear -- persona@email.com soporte` (y `quitar` para sacarle el rol).

### 7. Datos de ejemplo (solo en desarrollo)

```bash
npm run demo:cargar
```

Crea usuarios `@example.com` con páginas, 60 días de visitas, pedidos y contactos: Mika Cerámica (`/mika`, Pro), Lucas Entrena (Negocio), Sofi Ilustra (Inicial), una cuenta suspendida, una sin confirmar y un usuario de soporte. Al final muestra la contraseña de todos. Para borrarlos: `npm run demo:cargar -- --borrar`. El script solo toca usuarios que creó él (los marca en `app_metadata`, que nadie puede escribir desde afuera) y se niega a correr si `NEXT_PUBLIC_SITE_URL` no es localhost, salvo que agregues `--si-es-desarrollo`.

### 8. Tareas programadas: pruebas vencidas y limpieza de estadísticas

Dos funciones para programar con Cron de Supabase (**Integrations → Cron**) o por SQL:

- `expire_trials()` pasa a plan Inicial las cuentas con la prueba vencida. Una vez por día.
- `purge_old_events(p_days)` borra de la tabla de eventos (visitas, clicks, etc.) lo más viejo que `p_days` (por defecto 400, nunca menos de 180: el panel compara hasta 90 días contra los 90 anteriores). Sin esto la tabla crece para siempre y las estadísticas se van poniendo más lentas. Con una vez por semana alcanza.

```sql
select cron.schedule('vencer-pruebas', '10 6 * * *', $$select public.expire_trials()$$);
select cron.schedule('limpiar-eventos', '20 6 * * 0', $$select public.purge_old_events()$$);
```

### 9. Publicar en Vercel

1. Subí el proyecto a un repositorio de GitHub (el `.gitignore` ya excluye `.env.local`).
2. En Vercel: **Add New → Project**, elegí el repositorio y cargá las mismas variables de entorno, con los valores del proyecto de producción y `NEXT_PUBLIC_SITE_URL=https://tu-dominio`. El `vercel.json` del proyecto ya deja las funciones en **São Paulo** (`gru1`), la misma región que Supabase.
3. Conectá tu dominio y actualizá la **Site URL** de Supabase de producción.

### 10. Cómo queda cacheada la página pública

Cada página pública (`/<link>`) se sirve desde caché hasta por 5 minutos, para que las visitas no golpeen la base de datos una por una. Guardar en el editor, publicar/despublicar desde **Mi cuenta** o moderar una página desde `/admin` actualizan esa página al instante (no hay que esperar los 5 minutos); el límite de 5 minutos es solo el resguardo para el único caso que no pasa por esas pantallas: cuando alguien confirma su email y su página se publica sola por un disparador de la base.

---

## Seguridad

- **RLS en todas las tablas.** Cada persona ve y edita solo lo de sus cuentas; el staff puede leer para dar soporte. Los tokens de pagos (`payment_secrets`) no tienen ninguna política: ni siquiera un usuario logueado puede leerlos.
- **La clave secreta se usa solo en el servidor** (`lib/supabase/admin.ts` importa `server-only`), y siempre después de verificar el permiso de quien hace la acción.
- **Auditoría inalterable desde la app:** nadie puede editar ni borrar registros con la clave pública.
- **Analítica anónima:** no se guarda la IP. Cada visitante se identifica con un hash que cambia todos los días.
- **Formularios públicos** con campo trampa contra bots y límite de envíos por minuto.
- **Probá la base** contra una instancia local (`npx supabase start`):

  ```bash
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:probar
  ```

  Las pruebas corren dentro de una transacción y no dejan datos.

Antes de abrir al público, conviene sumar: MFA obligatorio para el staff, captcha en el registro (Cloudflare Turnstile se integra con Supabase Auth), límite de envíos compartido entre servidores (por ejemplo, Upstash Redis; el actual es por instancia) y backups con recuperación a un punto en el tiempo.

---

## Estructura

```
app/
  (auth)/            ingresar, registro, recuperar + sus Server Actions
  [slug]/            página pública de cada usuario
  admin/             panel de administración (resumen, usuarios, páginas, auditoría)
  panel/             panel del usuario (mis páginas, mi cuenta)
  cuenta/nueva-clave crear contraseña nueva después del link del email
  auth/              confirmar links de email, OAuth y cerrar sesión
  api/e              registro de visitas y clics
  api/leads          formularios y avisos de stock
  api/editor/[id]    leer y guardar una página completa (para el editor visual)
components/          formularios, página pública, íconos
lib/                 clientes de Supabase, permisos, auditoría, temas, formato
proxy.ts             refresca la sesión y protege rutas (reemplaza a middleware.ts en Next 16)
scripts/             crear administradores y cargar datos de ejemplo
supabase/
  migrations/        esquema completo, funciones, políticas y almacenamiento de fotos
  templates/         emails de confirmación, recuperación y cambio de email
  tests/             pruebas de seguridad de la base
```

## Qué sigue

1. **Editor visual:** portar el editor del prototipo sobre `/api/editor/[pageId]` (ya lee y guarda páginas completas con bloques y productos).
2. **Cobros:** checkout con Mercado Pago y webhooks. Las tablas de pedidos, ítems, estados y secretos ya están.
3. **Estadísticas completas:** portar el tablero del prototipo sobre `page_stats` (ya calcula totales, período anterior, origen, bloques, embudo, horarios, dispositivos y ciudades).
4. **Integraciones:** Meta Pixel y Google Analytics 4 por página, dominios propios.
