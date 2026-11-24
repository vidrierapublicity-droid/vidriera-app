#!/usr/bin/env node
/**
 * Datos de demostración para probar el panel de usuario y el de administración.
 *
 *   npm run demo:cargar              → crea (o regenera) los usuarios de ejemplo
 *   npm run demo:cargar -- --borrar  → borra todo lo que creó este script
 *
 * Crea usuarios @example.com marcados como demo en app_metadata (un dato que
 * solo el servidor puede escribir), con páginas, visitas, pedidos y contactos
 * de los últimos 60 días. Nunca toca usuarios que no creó este script.
 * Usalo en un proyecto de Supabase de desarrollo: si NEXT_PUBLIC_SITE_URL no
 * es localhost, pide confirmarlo con --si-es-desarrollo.
 *
 * Todos los usuarios demo comparten una contraseña al azar que se muestra al
 * final (o la que pongas en DEMO_PASSWORD).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const DAYS = 60
const TZ_OFFSET_H = -3 // Argentina, sin horario de verano
const BAN_FOREVER = '876000h'
const ACTOR = 'script:datos-demo'

/* ------------------------------------------------------------------ */
/* Usuarios de ejemplo                                                 */
/* ------------------------------------------------------------------ */

const MIKA_DOC = {
  name: 'Mika Cerámica',
  bio: 'Piezas de gres hechas a mano en Villa Crespo. Vajilla para todos los días y clases de torno para principiantes.',
  location: 'Villa Crespo, CABA',
  design: { theme: 'esmalte' },
  settings: {
    whatsapp: '5491100000000', cuotas: 3, transferDiscount: 10,
    shipping: { on: true, cost: 6500 }, pickup: { on: true, address: 'Taller en Villa Crespo, de martes a sábado' },
    seoTitle: 'Mika Cerámica · Tienda y clases de torno', seoDesc: 'Tazas, bowls y platos de gres hechos a mano. Envíos a todo el país.',
    hideBrand: false, timezone: 'America/Argentina/Buenos_Aires',
  },
  blocks: [
    { id: 'b_social', type: 'social', visible: true, data: { items: [{ net: 'instagram', handle: 'mika.ceramica' }, { net: 'tiktok', handle: 'mikaceramica' }, { net: 'whatsapp', handle: '' }] } },
    { id: 'b_clases', type: 'link', visible: true, data: { title: 'Clases de torno · cupos del mes', url: 'https://example.com/clases', featured: true } },
    {
      id: 'b_tienda', type: 'products', visible: true, data: { title: 'Tienda', layout: 'grid' },
      products: [
        { id: 'p_taza', name: 'Taza Luna', description: 'Gres esmaltado en celadón, 350 ml. Apta microondas y lavavajillas. Cada pieza es única.', price: 18500, compare_at_price: 21000, stock: 6, illustration: { kind: 'mug', color: '#8DB6A4' } },
        { id: 'p_bowl', name: 'Bowl Médano', description: '15 cm de diámetro, esmalte arena con borde crudo. Ideal para desayunos y ensaladas.', price: 22000, stock: 3, illustration: { kind: 'bowl', color: '#E6DCCB' } },
        { id: 'p_plato', name: 'Plato Arcilla 26 cm', description: 'Plato playo con esmalte blanco satinado y borde de arcilla a la vista.', price: 26500, stock: 8, illustration: { kind: 'plate', color: '#F1ECE4' } },
        { id: 'p_maceta', name: 'Maceta Nube', description: 'Con plato. 12 cm de alto, esmalte cobalto y agujero de drenaje.', price: 15900, stock: 0, illustration: { kind: 'planter', color: '#3F5E9C' } },
      ],
    },
    { id: 'b_sena', type: 'payment', visible: true, data: { title: 'Seña para clase de prueba', desc: 'Reservá tu lugar en la clase de 2 horas. El resto se abona en el taller.', mode: 'fixed', amount: 10000, suggested: [5000, 10000, 20000], button: 'Pagar seña' } },
    { id: 'b_empresas', type: 'form', visible: true, data: { kind: 'presupuesto', title: 'Regalos empresariales', desc: 'Tazas y cuencos personalizados desde 20 unidades. Contanos qué necesitás.', fields: { name: true, email: true, whatsapp: true, message: true }, button: 'Pedir presupuesto', thanks: '¡Gracias! Te respondemos en menos de 48 horas.' } },
    { id: 'b_lista', type: 'form', visible: true, data: { kind: 'lista', title: 'Avisame de la próxima hornada', desc: 'Un mail por mes, cuando salen piezas nuevas del horno.', fields: { name: false, email: true, whatsapp: false, message: false }, button: 'Quiero enterarme', thanks: 'Listo, te avisamos por mail.' } },
    { id: 'b_llegar', type: 'link', visible: true, data: { title: 'Cómo llegar al taller', url: 'https://maps.google.com/?q=Villa+Crespo,+Buenos+Aires', featured: false } },
    { id: 'b_envios', type: 'text', visible: true, data: { title: '', text: 'Envíos a todo el país. Retiro sin cargo en el taller de martes a sábado.' } },
  ],
}

const SOURCES_DEFAULT = { instagram: 0.5, tiktok: 0.17, whatsapp: 0.12, directo: 0.1, google: 0.06, otros: 0.05 }
const CTR_DEFAULT = { instagram: 0.44, tiktok: 0.36, whatsapp: 0.58, directo: 0.5, google: 0.4, otros: 0.35 }

export const USERS = [
  {
    key: 'mika', email: 'mika@example.com', fullName: 'Micaela Romero', pageName: 'Mika Cerámica', slug: 'mika',
    goal: 'productos', theme: 'esmalte', plan: 'pro', trialDays: 0, ageDays: 150,
    doc: MIKA_DOC,
    integrations: { transfer_enabled: true, transfer_alias: 'MIKA.CERAMICA.TALLER', transfer_holder: 'Micaela R.', whatsapp_orders: true },
    traffic: {
      perDay: 150, sources: SOURCES_DEFAULT, ctr: CTR_DEFAULT,
      conv: { instagram: 0.016, tiktok: 0.008, whatsapp: 0.046, directo: 0.026, google: 0.02, otros: 0.01 },
      spikes: { 38: ['tiktok', 2.4], 37: ['tiktok', 1.1], 36: ['tiktok', 0.45], 17: ['instagram', 0.9], 16: ['instagram', 0.4] },
    },
    clickShares: { b_tienda: 0.35, b_clases: 0.26, b_social: 0.11, b_sena: 0.08, b_llegar: 0.08, b_lista: 0.07, b_empresas: 0.05 },
    productWeights: { p_taza: 0.42, p_bowl: 0.24, p_plato: 0.2, p_maceta: 0.14 },
    cobroShare: 0.12,
    leadsPerDay: 1.3,
  },
  {
    key: 'lucas', email: 'lucas@example.com', fullName: 'Lucas Benítez', pageName: 'Lucas Entrena', slug: 'lucasentrena',
    goal: 'servicios', theme: 'pizarra', plan: 'negocio', trialDays: 0, ageDays: 95,
    patch: (doc) => {
      doc.bio = 'Entrenamiento funcional al aire libre y online. Planes para empezar de cero.'
      doc.location = 'Palermo, CABA'
      doc.settings = { ...doc.settings, whatsapp: '5491100000001' }
      for (const b of doc.blocks) if (b.type === 'social') b.data = { items: [{ net: 'instagram', handle: 'lucas.entrena' }, { net: 'youtube', handle: 'lucasentrena' }, { net: 'whatsapp', handle: '' }] }
      return doc
    },
    traffic: { perDay: 42, sources: { instagram: 0.46, whatsapp: 0.24, directo: 0.14, google: 0.1, otros: 0.06 }, ctr: CTR_DEFAULT, conv: { instagram: 0.012, whatsapp: 0.03, directo: 0.02, google: 0.015, otros: 0.008 } },
    cobroShare: 1,
    leadsPerDay: 0.9,
  },
  {
    key: 'sofi', email: 'sofi@example.com', fullName: 'Sofía Acosta', pageName: 'Sofi Ilustra', slug: 'sofi.ilustra',
    goal: 'contenido', theme: 'noche', plan: 'inicial', trialDays: 0, ageDays: 70,
    patch: (doc) => {
      doc.bio = 'Ilustro gatos, plantas y cosas lindas. Tutoriales todas las semanas.'
      doc.location = 'Rosario, Santa Fe'
      const links = doc.blocks.filter((b) => b.type === 'link')
      if (links[0]) links[0].data = { ...links[0].data, url: 'https://example.com/ultimo-video' }
      if (links[1]) links[1].data = { ...links[1].data, url: 'https://example.com/recomendaciones' }
      return doc
    },
    traffic: { perDay: 64, sources: { instagram: 0.38, tiktok: 0.4, directo: 0.12, google: 0.04, otros: 0.06 }, ctr: CTR_DEFAULT, conv: { instagram: 0.004, tiktok: 0.003, directo: 0.006, google: 0.002, otros: 0.002 } },
    cobroShare: 1,
    leadsPerDay: 1.6,
  },
  {
    key: 'tomas', email: 'tomas@example.com', fullName: 'Tomás Ruiz', pageName: 'Ofertas Tomás', slug: 'ofertastomas',
    goal: 'productos', theme: 'cartel', plan: 'pro', trialDays: 6, ageDays: 12,
    suspend: 'Demo: publicaba productos que no se permiten en la plataforma.', stopDaysAgo: 3,
    traffic: { perDay: 18, sources: { instagram: 0.3, whatsapp: 0.5, directo: 0.2 }, ctr: CTR_DEFAULT, conv: { instagram: 0.01, whatsapp: 0.02, directo: 0.01 } },
    leadsPerDay: 0.2,
  },
  {
    key: 'vale', email: 'vale@example.com', fullName: 'Valentina Sosa', pageName: 'Vale Plantas', slug: 'valeplantas',
    goal: 'todo', theme: 'terracota', unconfirmed: true, ageDays: 0,
  },
  {
    key: 'soporte', email: 'soporte@example.com', fullName: 'Equipo de soporte (demo)', pageName: 'Soporte demo', slug: 'soporte.demo',
    goal: 'todo', theme: 'vidrio', staff: 'soporte', draft: true, ageDays: 30,
  },
]

/* ------------------------------------------------------------------ */
/* Azar reproducible                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seedOf = (s) => createHash('sha256').update(s).digest().readUInt32LE(0)
function gauss(rng) {
  let u = 0, v = 0
  while (!u) u = rng()
  while (!v) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function poisson(rng, lambda) {
  if (!(lambda > 0)) return 0
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rng)))
  const L = Math.exp(-lambda)
  let k = 0, p = 1
  do { k++; p *= rng() } while (p > L)
  return k - 1
}
function pickW(rng, pairs) {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  let r = rng() * total
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v }
  return pairs[pairs.length - 1][0]
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const norm = (arr) => { const t = arr.reduce((a, b) => a + b, 0); return arr.map((x) => x / t) }
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const HOURS_WD = norm([0.9, 0.5, 0.3, 0.2, 0.2, 0.3, 0.8, 1.6, 2.4, 2.8, 3.0, 3.4, 4.2, 4.6, 3.8, 3.2, 3.3, 3.8, 4.4, 5.2, 6.2, 7.0, 6.4, 3.6])
const HOURS_WE = norm([1.6, 1.1, 0.7, 0.4, 0.3, 0.3, 0.4, 0.8, 1.5, 2.6, 3.6, 4.4, 4.8, 4.6, 4.0, 3.6, 3.8, 4.2, 4.8, 5.6, 6.4, 6.8, 5.8, 3.4])
const DOW = [1.12, 0.86, 0.9, 0.95, 1.1, 1.04, 1.18] // domingo … sábado
const CITIES = [['CABA', 0.34], ['Córdoba', 0.1], ['Rosario', 0.09], ['La Plata', 0.08], ['Mendoza', 0.06], ['Mar del Plata', 0.05], ['Tucumán', 0.04], ['Neuquén', 0.03], ['Salta', 0.03], [null, 0.18]]
const FIRST = ['Lucía', 'Martín', 'Sofía', 'Tomás', 'Valentina', 'Joaquín', 'Camila', 'Mateo', 'Julieta', 'Nicolás', 'Agustina', 'Facundo', 'Florencia', 'Santiago', 'Micaela', 'Lautaro', 'Carolina', 'Federico', 'Paula', 'Ignacio', 'Belén', 'Gonzalo', 'Rocío', 'Emiliano', 'Milagros', 'Franco', 'Josefina', 'Bruno', 'Abril', 'Ramiro']
const LAST = ['Fernández', 'Gómez', 'Rodríguez', 'López', 'Martínez', 'Díaz', 'Pérez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Molina', 'Castro', 'Ortiz', 'Silva', 'Rojas', 'Núñez', 'Luna', 'Cabrera', 'Ríos']
const COMPANIES = ['Estudio Trébol', 'Café Lumbre', 'Agencia Río Azul', 'Bodega Los Tilos', 'Coworking La Usina', 'Hostel Aromo']
const MESSAGES = {
  presupuesto: ['Hola! Necesitamos 40 tazas con el logo para regalar a fin de año.', '¿Hacen cuencos para un restaurante? Serían unos 60.', 'Queremos 25 tazas para el equipo, ¿qué plazos manejan?', 'Busco platos de postre para una cafetería, 30 unidades.'],
  contacto: ['¿Tenés turno el jueves a la tarde?', 'Quiero empezar a entrenar, ¿cómo son los planes?', '¿Hacés clases para principiantes?', 'Hola, ¿tenés lugar los sábados a la mañana?'],
}
const CITY_SHIP = ['Córdoba', 'Rosario', 'La Plata', 'Mendoza', 'CABA', 'Mar del Plata', 'Neuquén']

/* ------------------------------------------------------------------ */
/* Fechas en hora de Argentina                                         */
/* ------------------------------------------------------------------ */

/** Medianoche local (UTC-3) de hace `daysAgo` días, en milisegundos UTC. */
function localDayStart(daysAgo, now) {
  const local = new Date(now + TZ_OFFSET_H * 3600e3)
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * 86400e3
  return midnight - TZ_OFFSET_H * 3600e3
}
/** Un momento del día elegido según a qué hora se mira más el celular. Nunca en el futuro. */
function tsIn(rng, dayStart, now) {
  const dow = new Date(dayStart).getUTCDay() // a las 03:00 UTC la fecha UTC coincide con la local
  const weights = (dow === 0 || dow === 6 ? HOURS_WE : HOURS_WD).map((w, h) => [h, w])
  const maxHour = Math.floor((now - dayStart) / 3600e3)
  const usable = maxHour < 24 ? weights.filter(([h]) => h <= maxHour) : weights
  const hour = pickW(rng, usable)
  const ts = dayStart + hour * 3600e3 + Math.floor(rng() * 3600e3)
  return ts < now ? ts : now - Math.floor(rng() * Math.max(60e3, now - (dayStart + hour * 3600e3)))
}
function elapsedFraction(dayStart, now) {
  const dow = new Date(dayStart).getUTCDay()
  const hours = dow === 0 || dow === 6 ? HOURS_WE : HOURS_WD
  const h = (now - dayStart) / 3600e3
  let f = 0
  for (let i = 0; i < 24; i++) f += hours[i] * Math.max(0, Math.min(1, h - i))
  return Math.max(0.02, Math.min(1, f))
}

/* ------------------------------------------------------------------ */
/* Generación de actividad (pura: no toca la base)                     */
/* ------------------------------------------------------------------ */

/**
 * Arma visitas, clics, pedidos y contactos para una página.
 * `doc` es el resultado de get_page_doc; `idMap` traduce los ids de
 * ejemplo (b_tienda, p_taza…) a los uuid reales que devolvió save_page.
 */
export function generateActivity(cfg, { pageId, accountId, doc, idMap = {}, now = Date.now() }) {
  const rng = mulberry32(seedOf(cfg.key))
  const t = cfg.traffic
  const out = { events: [], orders: [], items: [], leads: [] }
  if (!t) return out

  const blocks = (doc.blocks ?? []).filter((b) => b.visible !== false)
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const products = blocks.flatMap((b) => (b.products ?? []).map((p) => ({ ...p, block_id: b.id })))

  let blockW
  if (cfg.clickShares) {
    blockW = Object.entries(cfg.clickShares).map(([tmp, w]) => [byId.get(idMap[tmp]), w]).filter(([b]) => b)
  } else {
    const TYPE_W = { link: 0.28, products: 0.3, payment: 0.14, form: 0.1, social: 0.14 }
    blockW = blocks
      .filter((b) => TYPE_W[b.type] && !(b.type === 'link' && !b.data?.url))
      .map((b) => [b, TYPE_W[b.type] * (b.type === 'link' && b.data?.featured ? 1.5 : 1)])
  }
  let prodW
  if (cfg.productWeights) {
    prodW = Object.entries(cfg.productWeights).map(([tmp, w]) => [products.find((p) => p.id === idMap[tmp]), w]).filter(([p]) => p)
  } else {
    prodW = products.map((p, i) => [p, 1 / (i + 1)])
  }
  const forms = blocks.filter((b) => b.type === 'form')
  const payment = blocks.find((b) => b.type === 'payment')
  const soldOut = products.filter((p) => p.stock === 0)
  const iso = (ms) => new Date(Math.min(ms, now - 1000)).toISOString()
  const person = () => {
    const fn = pick(rng, FIRST), ln = pick(rng, LAST)
    return { name: `${fn} ${ln}`, email: `${plain(fn)}.${plain(ln)[0]}${Math.floor(rng() * 90 + 10)}@example.com` }
  }
  const stop = cfg.stopDaysAgo ?? -1
  const first = Math.min(DAYS - 1, Math.max(0, (cfg.ageDays ?? DAYS) - 1)) // no antes de que exista la cuenta

  for (let daysAgo = first; daysAgo > stop; daysAgo--) {
    const dayStart = localDayStart(daysAgo, now)
    if (dayStart > now) continue
    const dow = new Date(dayStart).getUTCDay()
    const trend = 0.65 + 0.35 * ((DAYS - 1 - daysAgo) / (DAYS - 1))
    const frac = daysAgo === 0 ? elapsedFraction(dayStart, now) : 1
    const mean = t.perDay * trend * DOW[dow] * Math.exp(gauss(rng) * 0.12) * frac

    const visitSources = []
    const n = poisson(rng, mean)
    for (let i = 0; i < n; i++) visitSources.push(pickW(rng, Object.entries(t.sources)))
    const spike = t.spikes?.[daysAgo]
    if (spike) {
      const extra = poisson(rng, t.perDay * spike[1] * frac)
      for (let i = 0; i < extra; i++) visitSources.push(spike[0])
    }

    let visitor = 0
    for (const source of visitSources) {
      if (rng() > 0.2) visitor++ // a veces la misma persona entra dos veces el mismo día
      const base = {
        page_id: pageId, source,
        visitor_hash: createHash('sha256').update(`${cfg.key}:${daysAgo}:${visitor}`).digest('hex').slice(0, 32),
        device: pickW(rng, [['celular', 0.78], ['computadora', 0.18], ['tablet', 0.04]]),
        country: 'AR', region: null, city: pickW(rng, CITIES), value: null, block_id: null, product_id: null,
      }
      const ts = tsIn(rng, dayStart, now)
      out.events.push({ ...base, type: 'page_view', created_at: iso(ts) })

      if (blockW.length && rng() < (t.ctr[source] ?? 0.4)) {
        const clicks = rng() < 0.3 ? 2 : 1
        for (let c = 0; c < clicks; c++) {
          const block = pickW(rng, blockW)
          const cts = ts + Math.floor(5e3 + rng() * 120e3)
          if (block.type === 'products' && prodW.length) {
            const product = pickW(rng, prodW)
            out.events.push({ ...base, type: 'view_item', block_id: block.id, product_id: product.id, created_at: iso(cts) })
            if (product.stock !== 0 && rng() < 0.3) {
              out.events.push({ ...base, type: 'add_to_cart', block_id: block.id, product_id: product.id, created_at: iso(cts + 20e3) })
              if (rng() < 0.55) out.events.push({ ...base, type: 'begin_checkout', block_id: block.id, created_at: iso(cts + 60e3) })
            }
          } else {
            out.events.push({ ...base, type: 'click', block_id: block.id, created_at: iso(cts) })
          }
        }
      }

      if (rng() < (t.conv[source] ?? 0.005)) {
        const order = makeOrder(rng, cfg, { products: prodW, payment, soldOut, daysAgo, ts: ts + 180e3, now })
        if (order) {
          const id = randomUUID()
          out.orders.push({ id, page_id: pageId, account_id: accountId, source, ...order.row, created_at: iso(ts + 180e3), updated_at: iso(ts + 240e3) })
          for (const it of order.lines) out.items.push({ id: randomUUID(), order_id: id, ...it })
        }
      }
    }

    // Contactos por formularios y avisos de stock
    const leadCount = poisson(rng, (cfg.leadsPerDay ?? 0) * trend * frac)
    for (let i = 0; i < leadCount; i++) {
      const options = forms.map((f) => [{ kind: 'form', block: f }, f.data?.kind === 'presupuesto' ? 0.2 : 0.8])
      if (soldOut.length && daysAgo < 25) options.push([{ kind: 'stock', product: pick(rng, soldOut) }, 0.5])
      if (!options.length) break
      const choice = pickW(rng, options)
      const who = person()
      const source = pickW(rng, Object.entries(t.sources))
      const ts = tsIn(rng, dayStart, now)
      let row
      if (choice.kind === 'stock') {
        const p = choice.product
        row = { block_id: p.block_id, product_id: p.id, form_label: `Aviso de stock: ${p.name}`, name: null, email: who.email, whatsapp: null, message: null, status: 'nuevo' }
      } else {
        const f = choice.block.data?.fields ?? {}
        const kind = choice.block.data?.kind ?? 'contacto'
        const company = kind === 'presupuesto' ? pick(rng, COMPANIES) : ''
        row = {
          block_id: choice.block.id, product_id: null,
          form_label: (choice.block.data?.title || 'Formulario').slice(0, 120),
          name: f.name ? `${who.name}${company ? ` · ${company}` : ''}` : null,
          email: f.email ? who.email : null,
          whatsapp: f.whatsapp && (!f.email || rng() < 0.6) ? `+54 9 11 0000-${String(Math.floor(rng() * 9000 + 1000))}` : null,
          message: f.message ? pick(rng, MESSAGES[kind] ?? MESSAGES.contacto) : null,
          status: daysAgo > 3 ? 'contactado' : 'nuevo',
        }
        if (!row.email && !row.whatsapp) row.email = who.email
      }
      out.leads.push({ id: randomUUID(), page_id: pageId, account_id: accountId, source, created_at: iso(ts), ...row })
      out.events.push({
        page_id: pageId, source, visitor_hash: null, device: 'celular', country: 'AR', region: null, city: null, value: null,
        type: 'lead', block_id: row.block_id, product_id: row.product_id, created_at: iso(ts),
      })
    }
  }
  return out
}

function makeOrder(rng, cfg, { products, payment, soldOut, daysAgo, ts, now }) {
  const pool = products.filter(([p]) => !(soldOut.includes(p) && daysAgo < 25))
  const cobro = payment && (!pool.length || rng() < (cfg.cobroShare ?? 0.12))
  let lines
  if (cobro) {
    const d = payment.data ?? {}
    const amount = d.mode === 'fixed' && d.amount ? Number(d.amount) : Number(pick(rng, d.suggested?.length ? d.suggested : [2500]))
    lines = [{ product_id: null, block_id: payment.id, kind: 'cobro', name: (d.title || 'Cobro').slice(0, 120), unit_price: amount, quantity: 1 }]
  } else if (pool.length) {
    const first = pickW(rng, pool)
    lines = [{ product_id: first.id, block_id: first.block_id, kind: 'producto', name: first.name, unit_price: Number(first.price), quantity: rng() < 0.8 ? 1 : 2 }]
    const rest = pool.filter(([p]) => p !== first)
    if (rest.length && rng() < 0.28) {
      const second = pickW(rng, rest)
      lines.push({ product_id: second.id, block_id: second.block_id, kind: 'producto', name: second.name, unit_price: Number(second.price), quantity: 1 })
    }
  } else {
    return null
  }
  const method = cobro
    ? pickW(rng, [['mercadopago', 0.8], ['transferencia', 0.2]])
    : pickW(rng, [['mercadopago', 0.55], ['transferencia', 0.22], ['whatsapp', 0.18], ['stripe', 0.05]])
  const delivery = cobro ? 'ninguna' : rng() < 0.58 ? 'envio' : 'retiro'
  const subtotal = lines.reduce((a, l) => a + l.unit_price * l.quantity, 0)
  const discount = method === 'transferencia' && !cobro ? Math.round(subtotal * 0.1) : 0
  const shipping = delivery === 'envio' ? 6500 : 0
  let status
  if (daysAgo > 6) status = pickW(rng, [['entregado', 0.9], ['cancelado', 0.04], ['pagado', 0.06]])
  else if (method === 'whatsapp') status = pickW(rng, [['a_confirmar', 0.5], ['pagado', 0.35], ['entregado', 0.15]])
  else if (method === 'transferencia') status = pickW(rng, [['pendiente', 0.45], ['pagado', 0.4], ['entregado', 0.15]])
  else status = pickW(rng, [['pagado', 0.6], ['entregado', 0.25], ['pendiente', 0.15]])
  if (cobro && status === 'entregado') status = 'pagado'
  const fn = pick(rng, FIRST), ln = pick(rng, LAST)
  const paidAt = status === 'pagado' || status === 'entregado' ? new Date(Math.min(ts + (method === 'transferencia' ? 3 * 3600e3 : 90e3), now - 1000)).toISOString() : null
  return {
    lines,
    row: {
      status, payment_method: method, delivery_method: delivery,
      delivery_address: delivery === 'envio' ? pick(rng, CITY_SHIP) : null,
      customer_name: `${fn} ${ln}`, customer_contact: `${plain(fn)}.${plain(ln)[0]}@example.com`,
      currency: 'ARS', subtotal, discount, shipping, total: subtotal - discount + shipping, paid_at: paidAt,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Base de datos                                                       */
/* ------------------------------------------------------------------ */

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local')
    process.exit(1)
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(site)
  if (!local && !process.argv.includes('--si-es-desarrollo') && !process.argv.includes('--borrar')) {
    console.error(`NEXT_PUBLIC_SITE_URL es ${site}: parece producción.`)
    console.error('Los datos demo son para un proyecto de desarrollo. Si estás seguro, agregá --si-es-desarrollo.')
    process.exit(1)
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const must = (label) => ({ error, data }) => {
    if (error) throw new Error(`${label}: ${error.message}`)
    return data
  }

  async function listAllUsers() {
    const all = []
    for (let page = 1; page <= 200; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      all.push(...data.users)
      if (data.users.length < 1000) break
    }
    return all
  }
  // app_metadata solo lo escribe el servidor: nadie puede registrarse "como demo" desde afuera
  const isDemo = (u) => u?.app_metadata?.demo === true && (u.email ?? '').endsWith('@example.com')

  async function insertMany(table, rows, size = 800) {
    for (let i = 0; i < rows.length; i += size) {
      const { error } = await admin.from(table).insert(rows.slice(i, i + size))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }

  const users = await listAllUsers()

  if (process.argv.includes('--borrar')) {
    const demo = users.filter(isDemo)
    for (const u of demo) {
      await admin.from('staff').delete().eq('user_id', u.id)
      await admin.from('accounts').delete().eq('created_by', u.id).then(must(`cuentas de ${u.email}`))
      await admin.auth.admin.deleteUser(u.id).then(must(`usuario ${u.email}`))
      console.log(`Borrado: ${u.email}`)
    }
    await admin.from('audit_log').delete().eq('actor_email', ACTOR)
    console.log(demo.length ? `Listo: se borraron ${demo.length} usuarios demo.` : 'No había usuarios demo.')
    return
  }

  const password = process.env.DEMO_PASSWORD || `demo-${randomBytes(9).toString('base64url')}`
  const now = Date.now()
  const summary = []

  for (const cfg of USERS) {
    let user = users.find((u) => (u.email ?? '').toLowerCase() === cfg.email)
    if (user && !isDemo(user)) {
      console.warn(`Salteo ${cfg.email}: ya existe y no es un usuario demo.`)
      continue
    }
    const meta = { full_name: cfg.fullName, page_name: cfg.pageName, slug: cfg.slug, goal: cfg.goal, theme: cfg.theme }
    if (!user) {
      const data = await admin.auth.admin
        .createUser({ email: cfg.email, password, email_confirm: !cfg.unconfirmed, user_metadata: meta, app_metadata: { demo: true } })
        .then(must(`crear ${cfg.email}`))
      user = data.user
    } else {
      await admin.auth.admin.updateUserById(user.id, { password, ban_duration: 'none' }).then(must(`actualizar ${cfg.email}`))
    }

    const account = await admin.from('accounts').select('id').eq('created_by', user.id).order('created_at').limit(1).maybeSingle().then(must('cuenta'))
    if (!account) { console.warn(`Salteo ${cfg.email}: no tiene cuenta (¿corriste las migraciones?).`); continue }
    const page = await admin.from('pages').select('id, slug').eq('account_id', account.id).order('created_at').limit(1).maybeSingle().then(must('página'))
    if (!page) { console.warn(`Salteo ${cfg.email}: no tiene página.`); continue }

    const since = (days) => new Date(now - days * 86400e3).toISOString()
    await admin.from('accounts').update({
      plan: cfg.plan ?? 'pro',
      trial_ends_at: cfg.plan === undefined ? since(-14) : cfg.trialDays ? since(-cfg.trialDays) : null,
      status: 'activa', suspended_reason: null, created_at: since(cfg.ageDays ?? 0),
    }).eq('id', account.id).then(must('plan'))
    await admin.from('pages').update({
      status: cfg.unconfirmed || cfg.draft ? 'borrador' : 'publicada', moderation_note: null, created_at: since(cfg.ageDays ?? 0),
    }).eq('id', page.id).then(must('estado de la página'))
    if (cfg.integrations) await admin.from('integrations').update(cfg.integrations).eq('account_id', account.id).then(must('integraciones'))
    if (cfg.staff) await admin.from('staff').upsert({ user_id: user.id, role: cfg.staff }).then(must('staff'))

    // Contenido de la página
    let doc, idMap = {}
    if (cfg.doc) {
      const saved = await admin.rpc('save_page', { p_page: page.id, p_doc: cfg.doc }).then(must('guardar página'))
      doc = saved.page
      idMap = saved.ids
    } else {
      doc = await admin.rpc('get_page_doc', { p_page: page.id }).then(must('leer página'))
      if (cfg.patch) {
        const saved = await admin.rpc('save_page', { p_page: page.id, p_doc: cfg.patch(structuredClone(doc)) }).then(must('guardar página'))
        doc = saved.page
      }
    }

    // Actividad: se regenera desde cero en cada corrida
    await admin.from('events').delete().eq('page_id', page.id).then(must('limpiar visitas'))
    await admin.from('orders').delete().eq('page_id', page.id).then(must('limpiar pedidos'))
    await admin.from('leads').delete().eq('page_id', page.id).then(must('limpiar contactos'))
    const act = generateActivity(cfg, { pageId: page.id, accountId: account.id, doc, idMap, now })
    await insertMany('events', act.events)
    await insertMany('orders', act.orders)
    await insertMany('order_items', act.items)
    await insertMany('leads', act.leads)

    if (cfg.suspend) {
      await admin.auth.admin.updateUserById(user.id, { ban_duration: BAN_FOREVER }).then(must('suspender'))
      await admin.from('accounts').update({ status: 'suspendida', suspended_reason: cfg.suspend }).eq('id', account.id).then(must('suspender cuenta'))
      await admin.from('audit_log').insert({
        actor_id: null, actor_email: ACTOR, action: 'suspender_usuario', target_type: 'user', target_id: user.id,
        details: { reason: cfg.suspend, cuentas: [account.id] },
      }).then(must('auditoría'))
    }

    summary.push({
      email: cfg.email, link: `/${page.slug}`,
      visitas: act.events.filter((e) => e.type === 'page_view').length, pedidos: act.orders.length, contactos: act.leads.length,
      nota: cfg.suspend ? 'suspendida' : cfg.unconfirmed ? 'sin confirmar' : cfg.staff ? `staff: ${cfg.staff}` : '',
    })
    console.log(`✓ ${cfg.email} → /${page.slug}`)
  }

  console.log('\nUsuarios demo listos:')
  console.table(summary)
  console.log(`Contraseña de todos los usuarios demo: ${password}`)
  console.log('(No se guarda en ningún lado. Si la perdés, volvé a correr el script y se genera otra.)')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('No se pudieron cargar los datos demo:', err?.message ?? err)
    process.exit(1)
  })
}
