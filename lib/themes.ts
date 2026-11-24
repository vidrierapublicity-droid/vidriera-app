import type { CSSProperties } from 'react'
import type { Design } from '@/lib/types'

// Mismos temas que el prototipo. Las fuentes llegan como variables CSS
// desde next/font (ver app/[slug]/layout.tsx y app/layout.tsx).
export const FONTS = {
  moderna: { label: 'Moderna', head: 'var(--nf-display), var(--nf-ui), system-ui, sans-serif', body: 'var(--nf-ui), system-ui, sans-serif', w: 750 },
  editorial: { label: 'Editorial', head: 'var(--nf-young), Georgia, "Times New Roman", serif', body: 'var(--nf-ui), system-ui, sans-serif', w: 400 },
  retro: { label: 'Retro', head: 'var(--nf-caprasimo), "Cooper Black", Georgia, serif', body: 'var(--nf-ui), system-ui, sans-serif', w: 400 },
  cartel: { label: 'Cartel', head: 'var(--nf-marker), "Marker Felt", cursive', body: 'var(--nf-ui), system-ui, sans-serif', w: 400 },
  simple: { label: 'Simple', head: 'var(--nf-ui), system-ui, sans-serif', body: 'var(--nf-ui), system-ui, sans-serif', w: 800 },
} as const

type Theme = {
  label: string; font: keyof typeof FONTS; shape: keyof typeof SHAPES; style: 'solido' | 'contorno' | 'sombra'; dark: boolean
  bg: string; bgSolid: string; ink: string; muted: string; card: string; cardInk: string; btn: string; btnInk: string
  border: string; shadow: string; accent: string; img: string; inputBg: string; inputBorder: string
  sheet: string; sheetInk: string; sheetMuted: string; good: string; blur: string
}

export const SHAPES = {
  redondeado: { label: 'Redondeado', r: 14, card: 16, btn: 12 },
  pastilla: { label: 'Pastilla', r: 999, card: 20, btn: 999 },
  recto: { label: 'Recto', r: 4, card: 4, btn: 4 },
} as const

export const THEMES: Record<string, Theme> = {
  vidrio: {
    label: 'Vidrio', font: 'moderna', shape: 'redondeado', style: 'solido', dark: false,
    bg: 'linear-gradient(165deg,#E3EAF4 0%,#F0ECEA 55%,#F6E4DA 100%)', bgSolid: '#EEF0F4', ink: '#1A1D2B', muted: '#586074',
    card: 'rgba(255,255,255,.74)', cardInk: '#1A1D2B', btn: 'rgba(255,255,255,.82)', btnInk: '#1A1D2B',
    border: '1px solid rgba(255,255,255,.95)', shadow: '0 1px 2px rgba(26,29,43,.06),0 10px 24px -14px rgba(26,29,43,.3)',
    accent: '#FF5B22', img: '#E8EDF4', inputBg: '#FFFFFF', inputBorder: '#D2D7E1', sheet: '#FFFFFF', sheetInk: '#1A1D2B', sheetMuted: '#5E6477', good: '#0A7A36', blur: 'blur(12px)',
  },
  pizarra: {
    label: 'Pizarra', font: 'moderna', shape: 'redondeado', style: 'solido', dark: true,
    bg: '#15171E', bgSolid: '#15171E', ink: '#F1F2F6', muted: '#A3A8B8', card: '#20232C', cardInk: '#F1F2F6', btn: '#20232C', btnInk: '#F1F2F6',
    border: '1px solid #2F3340', shadow: 'none', accent: '#FF7A45', img: '#282C37', inputBg: '#15171E', inputBorder: '#3A3F4E', sheet: '#1C1F28', sheetInk: '#F1F2F6', sheetMuted: '#A3A8B8', good: '#4FD08A', blur: 'none',
  },
  esmalte: {
    label: 'Esmalte', font: 'editorial', shape: 'pastilla', style: 'solido', dark: false,
    bg: '#D3E2D9', bgSolid: '#D3E2D9', ink: '#15302A', muted: '#48645A', card: '#EEF5F0', cardInk: '#15302A', btn: '#15302A', btnInk: '#F0F6F2',
    border: '1px solid transparent', shadow: 'none', accent: '#B4532F', img: '#E2ECE6', inputBg: '#FFFFFF', inputBorder: '#BACDC3', sheet: '#FFFFFF', sheetInk: '#15302A', sheetMuted: '#4D665C', good: '#0B7236', blur: 'none',
  },
  cartel: {
    label: 'Cartel', font: 'cartel', shape: 'redondeado', style: 'sombra', dark: false,
    bg: '#FFE94A', bgSolid: '#FFE94A', ink: '#111111', muted: '#4A4420', card: '#FFFFFF', cardInk: '#111111', btn: '#FFFFFF', btnInk: '#111111',
    border: '2px solid #111111', shadow: '4px 4px 0 #111111', accent: '#111111', img: '#FFF6BF', inputBg: '#FFFFFF', inputBorder: '#111111', sheet: '#FFFFFF', sheetInk: '#111111', sheetMuted: '#4F4F4F', good: '#0A7A36', blur: 'none',
  },
  terracota: {
    label: 'Terracota', font: 'retro', shape: 'redondeado', style: 'solido', dark: false,
    bg: '#EBD8CA', bgSolid: '#EBD8CA', ink: '#3A1F14', muted: '#76523F', card: '#F7ECE4', cardInk: '#3A1F14', btn: '#9B4A2C', btnInk: '#FFF6EF',
    border: '1px solid transparent', shadow: '0 2px 0 rgba(58,31,20,.16)', accent: '#9B4A2C', img: '#F1E2D6', inputBg: '#FFFFFF', inputBorder: '#D8BFAE', sheet: '#FFFBF7', sheetInk: '#3A1F14', sheetMuted: '#76523F', good: '#2E7D32', blur: 'none',
  },
  noche: {
    label: 'Noche', font: 'moderna', shape: 'pastilla', style: 'solido', dark: true,
    bg: 'radial-gradient(120% 70% at 50% 0%,#3A2160 0%,#120F1F 55%,#0B0A12 100%)', bgSolid: '#120F1F', ink: '#F5F1FF', muted: '#BAB0D3',
    card: 'rgba(255,255,255,.07)', cardInk: '#F5F1FF', btn: 'rgba(255,255,255,.09)', btnInk: '#F5F1FF', border: '1px solid rgba(255,255,255,.15)',
    shadow: '0 12px 30px -16px rgba(255,95,210,.45)', accent: '#FF5FD2', img: 'rgba(255,255,255,.06)', inputBg: '#171326', inputBorder: '#3B3352', sheet: '#191528', sheetInk: '#F5F1FF', sheetMuted: '#BAB0D3', good: '#63E0A0', blur: 'blur(12px)',
  },
}

const HEX = /^#[0-9a-fA-F]{6}$/

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function readableInk(hex: string) {
  const L = luminance(hex)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? '#FFFFFF' : '#111111'
}

export function resolveTheme(design: Design | null | undefined) {
  const d = design ?? {}
  const t = THEMES[d.theme ?? ''] ?? THEMES.vidrio
  const font = FONTS[(d.font ?? t.font) as keyof typeof FONTS] ?? FONTS.moderna
  const shape = SHAPES[(d.shape ?? t.shape) as keyof typeof SHAPES] ?? SHAPES.redondeado
  const style = (['solido', 'contorno', 'sombra'] as const).find((s) => s === d.style) ?? t.style
  const accent = d.accent && HEX.test(d.accent) ? d.accent : t.accent
  return { t, font, shape, style, accent }
}

/** Variables CSS del tema para el contenedor .pp */
export function themeStyle(design: Design | null | undefined): CSSProperties {
  const { t, font, shape, style, accent } = resolveTheme(design)
  let btn = t.btn, btnInk = t.btnInk, border = t.border, shadow = t.shadow, blur = t.blur
  if (style === 'contorno') { btn = 'transparent'; btnInk = t.ink; border = `1.5px solid ${t.ink}`; shadow = 'none'; blur = 'none' }
  if (style === 'sombra') { border = `2px solid ${t.ink}`; shadow = `4px 4px 0 ${t.ink}` }
  if (style === 'solido' && t.style === 'sombra') { border = '1px solid transparent'; shadow = '0 2px 8px -2px rgba(0,0,0,.18)' }
  const vars: Record<string, string> = {
    '--pp-bg': t.bg, '--pp-bg-solid': t.bgSolid, '--pp-ink': t.ink, '--pp-muted': t.muted,
    '--pp-card': t.card, '--pp-card-ink': t.cardInk, '--pp-btn': btn, '--pp-btn-ink': btnInk,
    '--pp-border': border, '--pp-shadow': shadow,
    '--pp-shadow-sm': shadow === 'none' ? 'none' : style === 'sombra' ? `2px 2px 0 ${t.ink}` : '0 1px 2px rgba(0,0,0,.06)',
    '--pp-blur': blur, '--pp-accent': accent, '--pp-accent-ink': readableInk(accent),
    '--pp-radius': `${shape.r}px`, '--pp-radius-card': `${shape.card}px`, '--pp-radius-btn': `${shape.btn}px`,
    '--pp-head': font.head, '--pp-body': font.body, '--pp-head-w': String(font.w),
    '--pp-img-bg': t.img, '--pp-input-bg': t.inputBg, '--pp-input-border': t.inputBorder, '--pp-input-ink': t.cardInk,
    '--pp-sheet-bg': t.sheet, '--pp-sheet-ink': t.sheetInk, '--pp-sheet-muted': t.sheetMuted, '--pp-good': t.good,
    colorScheme: t.dark ? 'dark' : 'light',
  }
  return vars as CSSProperties
}
