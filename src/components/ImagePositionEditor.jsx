import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Focus,
  Maximize2,
  Move,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

/** Estilo CSS para foto de fundo (cover) — nunca distorce */
export function coverImageStyle(x = 50, y = 50, zoom = 100, fit = 'cover') {
  const z = Math.max(70, Math.min(250, Number(zoom) || 100)) / 100
  if (fit === 'contain') {
    return {
      maxWidth: '100%',
      maxHeight: '100%',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain',
      objectPosition: `${x}% ${y}%`,
      display: 'block',
      userSelect: 'none',
      pointerEvents: 'none',
    }
  }
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    transform: z !== 1 ? `scale(${z})` : undefined,
    transformOrigin: `${x}% ${y}%`,
    userSelect: 'none',
    pointerEvents: 'none',
  }
}

/**
 * Foto com pan/zoom real: zoom 100 = preenche (cover);
 * zoom &lt; 100 revela mais da imagem (menos corte nas laterais).
 * object-fit:cover + scale NÃO revela o que já foi cortado — por isso
 * calculamos o tamanho em px a partir da proporção real.
 */
export function FramedCoverPhoto({
  src,
  x = 50,
  y = 50,
  zoom = 100,
  alt = '',
  className = '',
  style: styleProp,
}) {
  const wrapRef = useRef(null)
  const [nat, setNat] = useState(null)
  const [box, setBox] = useState(null)
  const z = Math.max(70, Math.min(250, Number(zoom) || 100)) / 100

  useEffect(() => {
    if (!src) {
      setNat(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setNat({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = src
    return () => { cancelled = true }
  }, [src])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => {
      setBox({ w: el.clientWidth || 1, h: el.clientHeight || 1 })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [src])

  let imgStyle
  if (nat?.w && nat?.h && box?.w && box?.h) {
    const cover = Math.max(box.w / nat.w, box.h / nat.h)
    const s = cover * z
    imgStyle = {
      position: 'absolute',
      left: `${Number(x) || 50}%`,
      top: `${Number(y) || 50}%`,
      width: Math.round(nat.w * s),
      height: Math.round(nat.h * s),
      maxWidth: 'none',
      transform: 'translate(-50%, -50%)',
      userSelect: 'none',
      pointerEvents: 'none',
      ...styleProp,
    }
  } else {
    imgStyle = {
      position: 'absolute',
      left: `${Number(x) || 50}%`,
      top: `${Number(y) || 50}%`,
      width: `${Math.round(z * 100)}%`,
      height: `${Math.round(z * 100)}%`,
      maxWidth: 'none',
      objectFit: 'cover',
      transform: 'translate(-50%, -50%)',
      userSelect: 'none',
      pointerEvents: 'none',
      ...styleProp,
    }
  }

  return (
    <div ref={wrapRef} className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden={!alt}>
      {src ? <img src={src} alt={alt} draggable={false} style={imgStyle} /> : null}
    </div>
  )
}

/** Logo no formulário — caixa fixa, sem estourar */
export function LogoMark({ src, x = 50, y = 50, maxH = 56, maxW = 200, className = '' }) {
  if (!src) return null
  return (
    <div
      className={`mx-auto flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: '100%', maxWidth: maxW, height: maxH }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: maxH,
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          objectPosition: `${x}% ${y}%`,
          display: 'block',
        }}
      />
    </div>
  )
}

/**
 * Editor: arrastar + zoom + ajuste automático (preenche a moldura).
 * aspect: 'hero' | 'split' | 'cutout' | 'logo' | 'square'
 */
export default function ImagePositionEditor({
  open,
  src,
  meta,
  x = 50,
  y = 50,
  zoom = 100,
  aspect = 'hero',
  title = 'Ajustar foto',
  onCancel,
  onConfirm,
}) {
  const [pos, setPos] = useState({ x, y, zoom })
  const [imgSize, setImgSize] = useState(null)
  const [hint, setHint] = useState(true)
  const frameRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    if (open) {
      setPos({ x, y, zoom: zoom || 100 })
      setHint(true)
      const t = setTimeout(() => setHint(false), 2200)
      return () => clearTimeout(t)
    }
  }, [open, x, y, zoom, src])

  useEffect(() => {
    if (!open || !src) {
      setImgSize(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = src
    return () => { cancelled = true }
  }, [open, src])

  const frame = frameSize(aspect)
  const isContain = frame.mode === 'contain'

  const autoFit = useCallback(() => {
    const el = frameRef.current
    if (!el || !imgSize?.w || !imgSize?.h) {
      setPos({ x: 50, y: isContain ? 78 : 50, zoom: isContain ? 140 : 100 })
      return
    }
    const fw = el.clientWidth || 1
    const fh = el.clientHeight || 1
    const contain = Math.min(fw / imgSize.w, fh / imgSize.h)
    const cover = Math.max(fw / imgSize.w, fh / imgSize.h)

    if (isContain) {
      const visualBase = 0.62
      const nextZoom = clamp(Math.round((cover / contain / visualBase) * 100), 100, 250)
      setPos({ x: 50, y: 82, zoom: nextZoom })
    } else {
      // Preenche a moldura (cover). Depois o usuário reduz o zoom se quiser ver mais.
      setPos({ x: 50, y: 42, zoom: 100 })
    }
    setHint(false)
  }, [imgSize, isContain])

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    const el = frameRef.current
    if (!el) return
    el.setPointerCapture?.(e.pointerId)
    setHint(false)
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
      w: el.clientWidth || 1,
      h: el.clientHeight || 1,
    }
  }, [pos.x, pos.y])

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return
    const d = drag.current
    const z = Math.max(1, (pos.zoom || 100) / 100)
    const sens = 55 / z
    const dx = ((e.clientX - d.startX) / d.w) * sens
    const dy = ((e.clientY - d.startY) / d.h) * sens
    setPos(p => ({
      ...p,
      x: clamp(d.posX - dx, 0, 100),
      y: clamp(d.posY - dy, 0, 100),
    }))
  }, [pos.zoom])

  const endDrag = useCallback((e) => {
    if (!drag.current) return
    try { frameRef.current?.releasePointerCapture?.(e.pointerId) } catch { /* */ }
    drag.current = null
  }, [])

  if (!open || !src) return null

  const sizeLine = meta?.width
    ? `${meta.width}×${meta.height} px${meta.bytes ? ` · ${formatBytes(meta.bytes)}` : ''}`
    : imgSize
      ? `${imgSize.w}×${imgSize.h} px`
      : null

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-5"
      style={{ zIndex: 10080, background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148,163,184,0.16)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.6)',
          maxHeight: '92vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}
        >
          <div className="min-w-0">
            <p className="font-bold text-white text-[13px] leading-tight">{title}</p>
            <p className="text-[11px] mt-1 leading-snug" style={{ color: '#64748b' }}>
              O que cabe nesta moldura é o que aparece no site · arraste e use o zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 sm:px-5 pt-4 pb-3 flex-1 overflow-y-auto">
          {/* Frame */}
          <div className="relative mx-auto" style={{ maxWidth: frame.maxW }}>
            <div
              ref={frameRef}
              className="relative overflow-hidden select-none touch-none"
              style={{
                width: '100%',
                aspectRatio: frame.ratio,
                borderRadius: frame.radius,
                cursor: 'grab',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.35)',
                background: isContain
                  ? `
                    radial-gradient(ellipse 70% 55% at 40% 45%, rgba(22,163,74,0.28), transparent 58%),
                    linear-gradient(160deg, #0a1628 0%, #071018 100%)
                  `
                  : '#020617',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* Checkerboard só no cutout — bem sutil, atrás da atmosfera */}
              {isContain && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.12]"
                  aria-hidden
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #64748b 25%, transparent 25%), linear-gradient(-45deg, #64748b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #64748b 75%), linear-gradient(-45deg, transparent 75%, #64748b 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                  }}
                />
              )}

              {isContain ? (
                <div className="absolute inset-0 flex items-end justify-center pointer-events-none" style={{ padding: '4% 6% 0' }}>
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: `${Math.min(100, 62 + (pos.zoom - 100) * 0.22)}%`,
                      objectFit: 'contain',
                      objectPosition: `${pos.x}% ${pos.y}%`,
                      filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.5))',
                      transform: pos.zoom > 100 ? `scale(${1 + (pos.zoom - 100) / 220})` : undefined,
                      transformOrigin: 'bottom center',
                      transition: drag.current ? undefined : 'transform 120ms ease-out',
                    }}
                  />
                </div>
              ) : (
                <FramedCoverPhoto src={src} x={pos.x} y={pos.y} zoom={pos.zoom} />
              )}

              {/* Grade suave */}
              <div className="absolute inset-0 pointer-events-none opacity-40" aria-hidden>
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, transparent 33.33%, rgba(255,255,255,0.1) 33.33%, rgba(255,255,255,0.1) calc(33.33% + 1px), transparent calc(33.33% + 1px), transparent 66.66%, rgba(255,255,255,0.1) 66.66%, rgba(255,255,255,0.1) calc(66.66% + 1px), transparent calc(66.66% + 1px)),'
                      + 'linear-gradient(to bottom, transparent 33.33%, rgba(255,255,255,0.1) 33.33%, rgba(255,255,255,0.1) calc(33.33% + 1px), transparent calc(33.33% + 1px), transparent 66.66%, rgba(255,255,255,0.1) 66.66%, rgba(255,255,255,0.1) calc(66.66% + 1px), transparent calc(66.66% + 1px))',
                  }}
                />
              </div>

              {/* Cantos da moldura */}
              <CornerMarks />

              {/* Dica — só no canto, some sozinha */}
              {hint && (
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white/90"
                    style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <Move size={10} /> Arraste para posicionar
                  </span>
                </div>
              )}
            </div>

            <p className="text-center text-[10px] mt-2 tabular-nums" style={{ color: '#475569' }}>
              {frame.label}
              {sizeLine ? ` · ${sizeLine}` : ''}
            </p>
          </div>

          {/* Ações rápidas */}
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={autoFit}
              className="py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 text-white"
              style={{
                background: 'linear-gradient(135deg, #15803d, #16a34a)',
                boxShadow: '0 6px 18px rgba(22,163,74,0.28)',
              }}
            >
              <Maximize2 size={13} /> Ajuste automático
            </button>
            <button
              type="button"
              onClick={() => setPos({ x: 50, y: isContain ? 70 : 50, zoom: 100 })}
              className="py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
              style={{
                color: '#cbd5e1',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148,163,184,0.14)',
              }}
            >
              <Focus size={13} /> Centralizar
            </button>
          </div>

          {/* Zoom */}
          <div
            className="mt-3 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.1)' }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: '#94a3b8' }}>
                <ZoomIn size={12} /> Zoom manual
              </span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#86efac' }}>
                {Math.round(pos.zoom)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="p-1.5 rounded-lg"
                style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
                onClick={() => setPos(p => ({ ...p, zoom: clamp(p.zoom - 5, 70, 250) }))}
              >
                <ZoomOut size={13} />
              </button>
              <input
                type="range"
                min={70}
                max={250}
                step={1}
                value={pos.zoom}
                onChange={e => setPos(p => ({ ...p, zoom: Number(e.target.value) }))}
                className="flex-1 h-1.5"
                style={{ accentColor: '#22c55e' }}
              />
              <button
                type="button"
                className="p-1.5 rounded-lg"
                style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
                onClick={() => setPos(p => ({ ...p, zoom: clamp(p.zoom + 5, 70, 250) }))}
              >
                <ZoomIn size={13} />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPos({ x: 50, y: 50, zoom: 100 })}
            className="mt-2 w-full py-1.5 text-[10px] font-semibold flex items-center justify-center gap-1"
            style={{ color: '#64748b' }}
          >
            <RotateCcw size={10} /> Resetar tudo
          </button>
        </div>

        {/* Footer */}
        <div
          className="px-4 sm:px-5 py-3 flex gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(148,163,184,0.1)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ border: '1px solid rgba(148,163,184,0.18)', color: '#94a3b8' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ x: Math.round(pos.x), y: Math.round(pos.y), zoom: Math.round(pos.zoom) })}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', boxShadow: '0 8px 22px rgba(37,99,235,0.35)' }}
          >
            <Check size={15} /> Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CornerMarks() {
  const c = 'absolute w-3.5 h-3.5 pointer-events-none'
  const stroke = 'rgba(255,255,255,0.45)'
  return (
    <>
      <span className={c} style={{ top: 8, left: 8, borderTop: `2px solid ${stroke}`, borderLeft: `2px solid ${stroke}` }} />
      <span className={c} style={{ top: 8, right: 8, borderTop: `2px solid ${stroke}`, borderRight: `2px solid ${stroke}` }} />
      <span className={c} style={{ bottom: 8, left: 8, borderBottom: `2px solid ${stroke}`, borderLeft: `2px solid ${stroke}` }} />
      <span className={c} style={{ bottom: 8, right: 8, borderBottom: `2px solid ${stroke}`, borderRight: `2px solid ${stroke}` }} />
    </>
  )
}

function frameSize(aspect) {
  if (aspect === 'logo') {
    return { ratio: '1 / 1', maxW: 220, radius: 18, label: 'Logo', mode: 'contain' }
  }
  if (aspect === 'cutout') {
    return { ratio: '3 / 4', maxW: 280, radius: 18, label: 'PNG sem fundo', mode: 'contain' }
  }
  if (aspect === 'split') {
    return { ratio: '3 / 4', maxW: 300, radius: 18, label: 'Mesma proporção da landing (3:4)', mode: 'cover' }
  }
  if (aspect === 'card') {
    return { ratio: '4 / 3', maxW: 420, radius: 16, label: 'Card do material', mode: 'cover' }
  }
  return { ratio: '16 / 7', maxW: 420, radius: 14, label: 'Topo do formulário', mode: 'cover' }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function formatBytes(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}
