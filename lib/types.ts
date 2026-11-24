export type Design = {
  theme?: string
  accent?: string | null
  shape?: string | null
  style?: string | null
  font?: string | null
}

export type PageSettings = {
  whatsapp?: string
  cuotas?: number
  transferDiscount?: number
  shipping?: { on?: boolean; cost?: number }
  pickup?: { on?: boolean; address?: string }
  seoTitle?: string
  seoDesc?: string
  hideBrand?: boolean
  timezone?: string
}

export type LinkData = { title?: string; url?: string; featured?: boolean }
export type ProductsData = { title?: string; layout?: 'grid' | 'list' }
export type PaymentData = { title?: string; desc?: string; mode?: 'fixed' | 'free'; amount?: number; suggested?: number[]; button?: string }
export type FormData_ = {
  kind?: string
  title?: string
  desc?: string
  fields?: { name?: boolean; email?: boolean; whatsapp?: boolean; message?: boolean }
  button?: string
  thanks?: string
}
export type SocialData = { items?: { net: string; handle: string }[] }
export type TextData = { title?: string; text?: string }

export type PublicBlock =
  | { id: string; type: 'link'; data: LinkData }
  | { id: string; type: 'products'; data: ProductsData }
  | { id: string; type: 'payment'; data: PaymentData }
  | { id: string; type: 'form'; data: FormData_ }
  | { id: string; type: 'social'; data: SocialData }
  | { id: string; type: 'text'; data: TextData }

export type PublicProduct = {
  id: string
  block_id: string | null
  name: string
  description: string
  price: number
  compare_at_price: number | null
  stock: number | null
  image_path: string | null
  illustration: { kind?: string; color?: string } | null
}

export type PublicPageData = {
  page: {
    id: string
    slug: string
    name: string
    bio: string
    location: string
    avatar_path: string | null
    design: Design
    settings: PageSettings
    plan: 'inicial' | 'pro' | 'negocio'
  }
  blocks: PublicBlock[]
  products: PublicProduct[]
  integrations: {
    mercadopago: boolean
    stripe: boolean
    transfer: boolean
    whatsapp_orders: boolean
    meta_pixel_id: string | null
    ga4_id: string | null
  }
}

export type PageStats = {
  days: number
  from: string
  timezone: string
  totals: { visits: number; visitors: number; clicks: number; orders: number; revenue: number; leads: number }
  previous: { visits: number; clicks: number; orders: number; revenue: number; leads: number }
  by_day: { day: string; visits: number; clicks: number; orders: number; revenue: number }[]
  by_source: { source: string; visits: number; orders: number; revenue: number }[]
  by_block: { block_id: string; clicks: number }[]
  funnel: { visits: number; view_item: number; add_to_cart: number; begin_checkout: number; purchases: number }
  heat: { dow: number; hour: number; visits: number }[]
  devices: { device: string; visits: number }[]
  cities: { city: string; visits: number }[]
}

export const PLAN_LABEL: Record<string, string> = { inicial: 'Inicial', pro: 'Pro', negocio: 'Negocio' }
export const SOURCE_LABEL: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp', google: 'Google', directo: 'Directo', otros: 'Otros',
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente de pago', a_confirmar: 'A confirmar', pagado: 'Pagado', entregado: 'Entregado', cancelado: 'Cancelado',
}
