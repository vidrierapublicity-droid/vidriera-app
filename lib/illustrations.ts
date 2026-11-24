// Ilustraciones de producto cuando no hay foto (mismas del prototipo).
// Solo aceptan colores #RRGGBB y tipos conocidos: el SVG resultante es seguro.
const HEX = /^#[0-9a-fA-F]{6}$/
const CLAY = '#C69A76'

function shade(hex: string, amt: number) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)
  return '#' + ch.map((c) => Math.min(255, Math.max(0, f(c))).toString(16).padStart(2, '0')).join('')
}
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function illustrationSvg(kind?: string, color?: string): string {
  const g = color && HEX.test(color) ? color : '#8DB6A4'
  const gd = shade(g, -0.2), gdd = shade(g, -0.34), gl = shade(g, 0.35), c = CLAY, cd = shade(CLAY, -0.22)
  const dark = lum(g) < 0.3
  const sp = (pts: number[][]) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.15" fill="${dark ? '#FFFFFF' : '#3A2A20'}" opacity="${dark ? '.35' : '.28'}"/>`).join('')
  const open = '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">'
  switch (kind) {
    case 'mug':
      return open + '<ellipse cx="58" cy="97" rx="30" ry="4.5" fill="#000" opacity=".08"/>' +
        `<path d="M83 52h5a12 12 0 0 1 0 24h-5" fill="none" stroke="${gd}" stroke-width="7"/>` +
        `<path d="M33 40h50v44a12 12 0 0 1-12 12H45a12 12 0 0 1-12-12Z" fill="${g}"/>` +
        `<path d="M33 74c5 3 8-2 13 1s8 3 12 0 8-2 13 1 8 2 12-1v9a12 12 0 0 1-12 12H45a12 12 0 0 1-12-12Z" fill="${c}"/>` +
        `<path d="M39 46v24" stroke="${gl}" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
        `<ellipse cx="58" cy="40" rx="25" ry="5" fill="${gd}"/><ellipse cx="58" cy="39.6" rx="21" ry="3.4" fill="${gdd}"/>` +
        sp([[48, 55], [63, 51], [72, 63], [52, 67], [76, 47], [44, 86], [66, 90]]) + '</svg>'
    case 'bowl':
      return open + '<ellipse cx="60" cy="96" rx="25" ry="4" fill="#000" opacity=".08"/>' +
        `<path d="M47 87h26l-2 7H49Z" fill="${c}"/>` +
        `<path d="M16 55h88c0 21-19.7 36-44 36S16 76 16 55Z" fill="${g}"/>` +
        `<path d="M25 70c8 9 21 14 35 14" fill="none" stroke="${gl}" stroke-width="3" stroke-linecap="round" opacity=".6"/>` +
        `<ellipse cx="60" cy="55" rx="44" ry="10" fill="${gd}"/><ellipse cx="60" cy="56.6" rx="38" ry="7" fill="${gdd}"/>` +
        sp([[40, 72], [58, 78], [76, 70], [66, 62], [48, 64]]) + '</svg>'
    case 'plate':
      return open + '<ellipse cx="60" cy="86" rx="46" ry="10" fill="#000" opacity=".07"/>' +
        `<ellipse cx="60" cy="75" rx="48" ry="17" fill="${cd}"/><ellipse cx="60" cy="71" rx="48" ry="16.5" fill="${g}"/>` +
        `<ellipse cx="60" cy="71" rx="31" ry="9.6" fill="${gd}" opacity=".5"/>` +
        `<ellipse cx="60" cy="71" rx="47" ry="16" fill="none" stroke="${c}" stroke-width="1.6" opacity=".9"/>` +
        sp([[40, 66], [52, 76], [70, 64], [80, 74], [60, 70], [30, 72], [88, 68]]) + '</svg>'
    case 'planter':
      return open + '<ellipse cx="60" cy="98" rx="30" ry="4" fill="#000" opacity=".08"/>' +
        `<ellipse cx="60" cy="93" rx="29" ry="4.5" fill="${cd}"/>` +
        '<path d="M60 50C51 36 38 32 27 35c4 11 17 17 33 15Z" fill="#5B8B5E"/>' +
        '<path d="M60 50c3-16 13-24 28-25-2 13-12 22-28 25Z" fill="#4C7A50"/>' +
        '<path d="M60 50c-3-14 1-26 9-33 5 12 2 24-9 33Z" fill="#6A9A6B"/>' +
        `<path d="M35 53h50l-6 37H41Z" fill="${g}"/><rect x="32" y="48" width="56" height="9" rx="3" fill="${gd}"/>` +
        sp([[46, 66], [60, 74], [72, 64], [52, 82], [68, 84]]) + '</svg>'
    case 'box':
      return open + '<ellipse cx="60" cy="97" rx="32" ry="4.5" fill="#000" opacity=".08"/>' +
        `<path d="M26 48 60 36l34 12v34L60 96 26 82Z" fill="${g}"/><path d="M60 60v36L26 82V48Z" fill="${gd}"/>` +
        `<path d="M26 48l34 12 34-12M60 60v36" fill="none" stroke="${gdd}" stroke-width="2"/>` +
        `<path d="M43 42l34 12v10" fill="none" stroke="${gl}" stroke-width="5" opacity=".7"/></svg>`
    case 'gift':
      return open + '<ellipse cx="60" cy="92" rx="36" ry="4" fill="#000" opacity=".07"/>' +
        `<rect x="22" y="38" width="76" height="50" rx="9" fill="${g}"/><path d="M22 56h76M46 38v50" stroke="${gd}" stroke-width="7"/>` +
        `<circle cx="46" cy="56" r="7" fill="${gdd}"/><path d="M60 76h26" stroke="${gl}" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>`
    default:
      return open + '<ellipse cx="60" cy="97" rx="28" ry="4.5" fill="#000" opacity=".08"/>' +
        `<path d="M46 46v-6a14 14 0 0 1 28 0v6" fill="none" stroke="${gdd}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M34 46h52l-4 48H38Z" fill="${g}"/><path d="M34 46h52l-1 10H35Z" fill="${gd}"/>` +
        `<path d="M52 72h16" stroke="${gl}" stroke-width="5" stroke-linecap="round"/></svg>`
  }
}
