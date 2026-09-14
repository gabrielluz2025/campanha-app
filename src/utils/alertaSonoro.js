const SOM_KEY = 'campo_torre_som_ativo'

export function lerSomTorreAtivo() {
  try {
    return localStorage.getItem(SOM_KEY) !== '0'
  } catch {
    return true
  }
}

export function salvarSomTorreAtivo(ativo) {
  try {
    localStorage.setItem(SOM_KEY, ativo ? '1' : '0')
  } catch {
    /* ignore */
  }
}

let audioCtx = null

/** Resume AudioContext após gesto do usuário (política de autoplay). */
export function prepararAudioTorre() {
  if (typeof window === 'undefined') return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
}

/** Dois beeps curtos (440 Hz → 880 Hz) via Web Audio API. */
export function tocarAlertaForaRaio() {
  if (!lerSomTorreAtivo()) return
  prepararAudioTorre()
  if (!audioCtx) return

  const t0 = audioCtx.currentTime
  const beeps = [
    { freq: 440, at: 0 },
    { freq: 880, at: 0.22 },
  ]

  for (const { freq, at } of beeps) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = t0 + at
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.11, start + 0.025)
    gain.gain.linearRampToValueAtTime(0, start + 0.11)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + 0.13)
  }
}
