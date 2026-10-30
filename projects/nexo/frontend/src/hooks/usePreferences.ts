import { useEffect, useState } from 'react'
import { selection } from '../data/selection'

export type Theme = 'dark' | 'light'

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('nexo:theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* The theme still works when browser storage is unavailable. */
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
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
      /* Keep the in-memory choice. */
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
            typeof id === 'string' && selection.some((item) => item.id === id),
        )
      : []
  } catch {
    return []
  }
}

export function useSavedMedia() {
  const [saved, setSaved] = useState<string[]>(readSaved)
  useEffect(() => {
    try {
      localStorage.setItem('nexo:saved', JSON.stringify(saved))
    } catch {
      /* The list remains usable in memory. */
    }
  }, [saved])
  return {
    saved,
    toggleSaved: (id: string) =>
      setSaved((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      ),
  }
}
