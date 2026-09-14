import { useEffect, useState } from 'react'

/** Celular/tablet touch em viewport estreita — layout “campo” (app). */
export function computeMobileLayout() {
  if (typeof window === 'undefined') return false
  if (!window.matchMedia('(max-width: 1023px)').matches) return false
  // Desktop/laptop com mouse: sempre layout web (sidebar), mesmo com janela estreita.
  if (window.matchMedia('(pointer: fine)').matches) return false
  return true
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.matchMedia?.('(display-mode: minimal-ui)')?.matches
    || window.navigator?.standalone === true,
  )
}

export function useMobileLayout() {
  const [mobile, setMobile] = useState(computeMobileLayout)

  useEffect(() => {
    const queries = [
      window.matchMedia('(max-width: 1023px)'),
      window.matchMedia('(pointer: fine)'),
    ]
    const apply = () => setMobile(computeMobileLayout())
    apply()
    for (const mq of queries) mq.addEventListener?.('change', apply)
    return () => {
      for (const mq of queries) mq.removeEventListener?.('change', apply)
    }
  }, [])

  return mobile
}

/** Sincroniza `data-layout="web"|"mobile"` no `<html>` para CSS global. */
export function useViewportModeSync() {
  const mobile = useMobileLayout()

  useEffect(() => {
    const root = document.documentElement
    root.dataset.layout = mobile ? 'mobile' : 'web'
    root.dataset.pwa = isStandalonePwa() ? 'standalone' : 'browser'
    return () => {
      delete root.dataset.layout
      delete root.dataset.pwa
    }
  }, [mobile])

  return mobile
}
