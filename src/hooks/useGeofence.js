import { useEffect, useRef, useState } from 'react'
import { distanciaMetrosParada } from '../utils/rotaUtils'

/** Raio de entrada — dentro deste limite o dwell time começa. */
export const RADIUS_IN = 90
/** Histerese de saída — além deste limite o timer é resetado. */
export const RADIUS_OUT = 110
/** Precisão máxima aceita (metros); pontos piores são ignorados. */
export const MAX_ACCURACY = 80
/** Tempo contínuo dentro do raio para confirmar chegada. */
export const DWELL_TIME_MS = 15000

function coordsValidos(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

function lerCoords(origem) {
  if (!origem) return { lat: NaN, lng: NaN }
  const lat = Number(origem.lat ?? origem.latitude)
  const lng = Number(origem.lng ?? origem.longitude)
  return { lat, lng }
}

/**
 * Geofence com dwell time e histerese para evitar falsos positivos de GPS.
 *
 * @param {{ lat?: number, lng?: number } | null} targetCoords — destino (parada)
 * @param {{ lat?: number, lng?: number, latitude?: number, longitude?: number } | null} currentCoords — GPS atual
 * @param {number | null | undefined} accuracy — precisão do GPS em metros
 * @param {{ radiusIn?: number, radiusOut?: number, maxAccuracy?: number, dwellTimeMs?: number }} [options]
 * @returns {{ isConfirming: boolean, timeLeft: number, hasArrived: boolean }}
 */
export function useGeofence(targetCoords, currentCoords, accuracy, options = {}) {
  const radiusIn = options.radiusIn ?? RADIUS_IN
  const radiusOut = options.radiusOut ?? RADIUS_OUT
  const maxAccuracy = options.maxAccuracy ?? MAX_ACCURACY
  const dwellTimeMs = options.dwellTimeMs ?? DWELL_TIME_MS

  const [isConfirming, setIsConfirming] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [hasArrived, setHasArrived] = useState(false)

  const dwellStartRef = useRef(null)
  const tickRef = useRef(null)

  const { lat: targetLat, lng: targetLng } = lerCoords(targetCoords)
  const { lat: currentLat, lng: currentLng } = lerCoords(currentCoords)
  const acc = Number(accuracy)

  // Novo destino → reinicia estado
  useEffect(() => {
    dwellStartRef.current = null
    setIsConfirming(false)
    setTimeLeft(0)
    setHasArrived(false)
  }, [targetLat, targetLng])

  useEffect(() => {
    const pararTick = () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }

    if (hasArrived) {
      pararTick()
      return undefined
    }

    if (!coordsValidos(targetLat, targetLng) || !coordsValidos(currentLat, currentLng)) {
      pararTick()
      dwellStartRef.current = null
      setIsConfirming(false)
      setTimeLeft(0)
      return undefined
    }

    // Sinal impreciso — ignora amostra sem resetar timer em andamento
    if (Number.isFinite(acc) && acc > maxAccuracy) {
      return undefined
    }

    const dist = distanciaMetrosParada(
      { lat: currentLat, lng: currentLng },
      { lat: targetLat, lng: targetLng },
    )

    if (!Number.isFinite(dist)) return undefined

    if (dist > radiusOut) {
      dwellStartRef.current = null
      setIsConfirming(false)
      setTimeLeft(0)
      pararTick()
      return pararTick
    }

    const dentroRaioEntrada = dist <= radiusIn
    const naZonaHisterese = dist > radiusIn && dist <= radiusOut

    if (!dentroRaioEntrada && naZonaHisterese && !dwellStartRef.current) {
      return undefined
    }

    if (dentroRaioEntrada || dwellStartRef.current) {
      if (!dwellStartRef.current) {
        dwellStartRef.current = Date.now()
      }

      const atualizarTempo = () => {
        const inicio = dwellStartRef.current
        if (!inicio) return
        const decorrido = Date.now() - inicio
        if (decorrido >= dwellTimeMs) {
          setHasArrived(true)
          setIsConfirming(false)
          setTimeLeft(0)
          pararTick()
        } else {
          setIsConfirming(true)
          setTimeLeft(Math.max(1, Math.ceil((dwellTimeMs - decorrido) / 1000)))
        }
      }

      atualizarTempo()

      if (!tickRef.current) {
        tickRef.current = setInterval(atualizarTempo, 500)
      }
    }

    return pararTick
  }, [
    targetLat,
    targetLng,
    currentLat,
    currentLng,
    acc,
    hasArrived,
    radiusIn,
    radiusOut,
    maxAccuracy,
    dwellTimeMs,
  ])

  return { isConfirming, timeLeft, hasArrived }
}
