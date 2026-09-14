/** Interpola hex entre duas cores (t ∈ 0..1) */
export function lerpHex(a, b, t) {
  const p = Math.max(0, Math.min(1, t))
  const parse = (h) => {
    const n = h.replace('#', '')
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  }
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const to = (x) => Math.round(x).toString(16).padStart(2, '0')
  return `#${to(ar + (br - ar) * p)}${to(ag + (bg - ag) * p)}${to(ab + (bb - ab) * p)}`
}

export function pctColor(pct) {
  if (pct === undefined || pct === null) return '#1a1a2e'
  if (pct === 0) return '#7f1d1d'
  if (pct < 1) return '#134e4a'
  if (pct < 2) return '#065f46'
  if (pct < 4) return '#047857'
  if (pct < 7) return '#059669'
  if (pct < 10) return '#10b981'
  return '#34d399'
}

export function votosColor(v) {
  if (!v || v === 0) return '#7f1d1d'
  if (v < 5) return '#1e3a8a'
  if (v < 15) return '#1d4ed8'
  if (v < 30) return '#2563eb'
  if (v < 60) return '#3b82f6'
  if (v < 100) return '#60a5fa'
  return '#93c5fd'
}

export function coberturaRatio(f) {
  if (!f) return 0
  const meta = Number(f.pessoasMeta) || 0
  const tem = Number(f.pessoasTem) || 0
  if (f.coberto || (meta > 0 && (Number(f.pessoasFaltamMeta) || 0) <= 0 && tem >= meta)) return 1
  if (meta <= 0) return tem > 0 ? 0.35 : 0
  return Math.max(0, Math.min(1, tem / meta))
}

export function coberturaColor(ratio) {
  const t = Math.max(0, Math.min(1, Number(ratio) || 0))
  if (t <= 0.5) return lerpHex('#dc2626', '#f59e0b', t * 2)
  return lerpHex('#f59e0b', '#22c55e', (t - 0.5) * 2)
}

export function forcaStatusColor(f) {
  if (!f) return 'rgba(255,255,255,0.07)'
  return coberturaColor(coberturaRatio(f))
}

/** Radar: 0 = tranquilo (verde) → 100 = urgente (vermelho) */
export function radarColor(score) {
  const t = Math.max(0, Math.min(1, (Number(score) || 0) / 100))
  if (t <= 0.35) return lerpHex('#065f46', '#059669', t / 0.35)
  if (t <= 0.65) return lerpHex('#059669', '#f59e0b', (t - 0.35) / 0.3)
  return lerpHex('#f59e0b', '#dc2626', (t - 0.65) / 0.35)
}

export function colegioMarkerSize(votos) {
  if (!votos) return 8
  if (votos < 10) return 8
  if (votos < 50) return 9
  if (votos < 150) return 10
  return 11
}
