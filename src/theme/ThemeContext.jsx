import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const THEME_KEY = 'campanha_theme'

/** @typedef {'dark' | 'light'} ThemeMode */

/**
 * @param {unknown} value
 * @returns {ThemeMode}
 */
export function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

/**
 * @param {ThemeMode} theme
 */
export function applyTheme(theme) {
  const mode = normalizeTheme(theme)
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'light' ? '#e8ecf3' : '#05080f')
  try { localStorage.setItem(THEME_KEY, mode) } catch { /* ignore */ }
}

/**
 * @returns {ThemeMode}
 */
export function readStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'dark'
  }
}

const ThemeContext = createContext({
  theme: /** @type {ThemeMode} */ ('dark'),
  isDark: true,
  isLight: false,
  setTheme: /** @type {(t: ThemeMode) => void} */ (() => {}),
  toggleTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
      return normalizeTheme(document.documentElement.dataset.theme)
    }
    return readStoredTheme()
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    setThemeState(normalizeTheme(next))
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    setTheme,
    toggleTheme,
  }), [theme, setTheme, toggleTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
