import type { ReactNode } from 'react'
import { themeStyle } from '@/lib/themes'
import { illustrationSvg } from '@/lib/illustrations'
import { NETWORKS, safeUrl, whatsappLink } from '@/lib/networks'
import { mediaUrl, publicHost } from '@/lib/site'
import { initials, money } from '@/lib/format'
import type { PublicBlock, PublicPageData, PublicProduct } from '@/lib/types'
import { Icon, SOCIAL_ICON } from '@/components/icons'
import { LeadForm, StockNotify, Tracker } from '@/components/public-client'

/**
 * Página pública (vidriera.link/<slug>), renderizada en el servidor.
 * Etapa 1: enlaces, redes, catálogo con pedido por WhatsApp, aviso de
 * stock, formularios y analítica. El checkout con Mercado Pago llega en
 * la etapa 2 (la base ya tiene pedidos, ítems y estados).
 */
export function PublicPage({ data }: { data: PublicPageData }) {
  const { page, blocks } = data
  const settings = page.settings ?? {}
  const avatar = mediaUrl(page.avatar_path)
  const showBrand = !(settings.hideBrand && page.plan !== 'inicial')

  return (
    <div className="pp pp--full" style={themeStyle(page.design)}>
      <Tracker pageId={page.id} />
      <div className="pp-scroll">
        <main className="pp-col">
          <header className="pp-head">
            <div className="pp-avatar" aria-hidden="true">
              {avatar ? <img src={avatar} alt="" /> : initials(page.name || page.slug)}
            </div>
            <h1 className="pp-name">{page.name || page.slug}</h1>
            {page.bio ? <p className="pp-bio">{page.bio}</p> : null}
            {page.location ? (
              <p className="pp-loc"><Icon name="pin" />{page.location}</p>
            ) : null}
          </header>

          {blocks.map((block) => (
            <BlockView key={block.id} block={block} data={data} />
          ))}

          {showBrand ? (
            <footer className="pp-foot">
              <span>Hecho con</span>
              <a href="/" className="pp-foot-brand">Vidriera</a>
            </footer>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function BlockView({ block, data }: { block: PublicBlock; data: PublicPageData }): ReactNode {
  const { page, products, integrations } = data
  const whatsapp = page.settings?.whatsapp ?? ''

  switch (block.type) {
    case 'social': {
      const items = (block.data.items ?? [])
        .filter((it) => NETWORKS[it.net])
        .map((it) => {
          const handle = it.net === 'whatsapp' && !it.handle ? whatsapp : it.handle
          return { ...it, url: handle ? safeUrl(NETWORKS[it.net].url(String(handle))) : '' }
        })
        .filter((it) => it.url)
      if (!items.length) return null
      return (
        <nav className="pp-social" aria-label="Redes">
          {items.map((it, i) => (
            <a key={i} className="pp-soc" href={it.url} target="_blank" rel="noopener noreferrer" data-ev="click" data-b={block.id}>
              <Icon name={SOCIAL_ICON[it.net] ?? 'globe'} />
              <span>{NETWORKS[it.net].label}</span>
            </a>
          ))}
        </nav>
      )
    }

    case 'link': {
      const url = safeUrl(block.data.url)
      if (!url) return null
      return (
        <a
          className={`pp-link ${block.data.featured ? 'is-featured' : ''}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          data-ev="click"
          data-b={block.id}
        >
          <span>{block.data.title || url.replace(/^https?:\/\//, '')}</span>
          {block.data.featured ? <Icon name="arrowRight" /> : null}
        </a>
      )
    }

    case 'products': {
      const items = products.filter((p) => p.block_id === block.id)
      if (!items.length) return null
      return (
        <section className="pp-sec" aria-label={block.data.title || 'Productos'}>
          <h2 className="pp-sec-title">
            <span>{block.data.title || 'Productos'}</span>
            <small>{items.length} {items.length === 1 ? 'producto' : 'productos'}</small>
          </h2>
          <div className={`pp-grid ${block.data.layout === 'list' ? 'is-list' : ''}`}>
            {items.map((p) => (
              <ProductCard key={p.id} product={p} blockId={block.id} data={data} canOrder={integrations.whatsapp_orders && Boolean(whatsapp)} />
            ))}
          </div>
        </section>
      )
    }

    case 'payment': {
      const d = block.data
      const amountText = d.mode === 'fixed' && d.amount ? money(d.amount) : 'Monto a elección'
      const link = whatsappLink(whatsapp, `¡Hola ${page.name}! Quiero pagar «${d.title ?? 'cobro'}» (${amountText}).`)
      return (
        <section className="pp-card">
          <div className="pp-pay-top">
            <div><h2 className="pp-card-title">{d.title || 'Cobro'}</h2></div>
            {d.mode === 'fixed' && d.amount ? <div className="pp-pay-amt">{money(d.amount)}</div> : null}
          </div>
          {d.desc ? <p className="pp-card-desc">{d.desc}</p> : null}
          {link ? (
            <a className="pp-btn" href={link} target="_blank" rel="noopener noreferrer" data-ev="contact" data-b={block.id}>
              <Icon name="chat" /><span>{d.button ? `${d.button} por WhatsApp` : 'Coordinar el pago por WhatsApp'}</span>
            </a>
          ) : (
            <p className="pp-fine"><Icon name="lock" />El cobro online se habilita pronto.</p>
          )}
        </section>
      )
    }

    case 'form':
      return <LeadForm pageId={page.id} blockId={block.id} data={block.data} />

    case 'text':
      if (!block.data.title && !block.data.text) return null
      return (
        <section className="pp-text">
          {block.data.title ? <h2>{block.data.title}</h2> : null}
          {block.data.text ? <p>{block.data.text}</p> : null}
        </section>
      )

    default:
      return null
  }
}

function ProductCard({ product: p, blockId, data, canOrder }: { product: PublicProduct; blockId: string; data: PublicPageData; canOrder: boolean }) {
  const { page } = data
  const cuotas = Number(page.settings?.cuotas ?? 0)
  const out = p.stock !== null && p.stock <= 0
  const sale = p.compare_at_price !== null && Number(p.compare_at_price) > Number(p.price)
  const img = mediaUrl(p.image_path)
  const orderText = `¡Hola ${page.name}! Quiero pedir «${p.name}» (${money(p.price)}). Lo vi en ${publicHost()}/${page.slug}`
  const orderLink = canOrder ? whatsappLink(page.settings?.whatsapp, orderText) : ''

  return (
    <article className="pp-prod">
      <span className="pp-prod-img">
        {img ? (
          <img src={img} alt={p.name} loading="lazy" />
        ) : (
          <span className="pp-illo" dangerouslySetInnerHTML={{ __html: illustrationSvg(p.illustration?.kind, p.illustration?.color) }} />
        )}
        {out ? (
          <span className="pp-badge">Sin stock</span>
        ) : sale ? (
          <span className="pp-badge is-sale">-{Math.round((1 - Number(p.price) / Number(p.compare_at_price)) * 100)}%</span>
        ) : p.stock !== null && p.stock <= 3 ? (
          <span className="pp-badge">Últimas {p.stock}</span>
        ) : null}
      </span>
      <span className="pp-prod-body">
        <span className="pp-prod-name">{p.name}</span>
        <span className="pp-prod-price">
          <span className="pp-price">{money(p.price)}</span>
          {sale ? <s className="pp-compare">{money(p.compare_at_price)}</s> : null}
        </span>
        {cuotas > 1 ? <span className="pp-cuotas">{cuotas} cuotas sin interés</span> : null}
        {p.description ? <span className="pp-prod-desc">{p.description}</span> : null}
        <span className="pp-prod-actions">
          {out ? (
            <StockNotify pageId={page.id} productId={p.id} />
          ) : orderLink ? (
            <a className="pp-mini" href={orderLink} target="_blank" rel="noopener noreferrer" data-ev="contact" data-b={blockId} data-pr={p.id}>
              <Icon name="chat" />Pedir por WhatsApp
            </a>
          ) : null}
        </span>
      </span>
    </article>
  )
}
