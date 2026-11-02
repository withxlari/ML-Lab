import { useEffect, useState } from 'react'
import type { MediaItem } from '../data/selection'
import { isStoredMediaItem } from '../services/catalog'
export type Theme = 'dark' | 'light'
export function readTheme(): Theme {
  const fallback =
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  try {
    const stored = localStorage.getItem('nexo:theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    return fallback
  }
  return fallback
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#1b1717' : '#f4f1e8')
    try {
      localStorage.setItem('nexo:theme', theme)
    } catch {
      return
    }
  }, [theme])
  return {
    theme,
    toggleTheme: () =>
      setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  }
}
function readSaved(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem('nexo:saved') ?? '[]',
    )
    return Array.isArray(value)
      ? value.filter(
          (id): id is string =>
            typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
        )
      : []
  } catch {
    return []
  }
}
export function useSavedMedia() {
  const [saved, setSaved] = useState<string[]>(readSaved)
  const [savedSnapshots, setSnapshots] = useState<MediaItem[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem('nexo:saved-items') ?? '[]',
      )
      return Array.isArray(value) ? value.filter(isStoredMediaItem) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('nexo:saved', JSON.stringify(saved))
      localStorage.setItem('nexo:saved-items', JSON.stringify(savedSnapshots))
    } catch {
      return
    }
  }, [saved, savedSnapshots])
  return {
    saved,
    savedSnapshots,
    clearSaved: () => {
      setSaved([])
      setSnapshots([])
    },
    toggleSaved: (item: MediaItem) => {
      const id = item.id
      setSnapshots((current) =>
        saved.includes(id)
          ? current.filter((entry) => entry.id !== id)
          : [...current.filter((entry) => entry.id !== id), item],
      )
      setSaved((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      )
    },
  }
}
