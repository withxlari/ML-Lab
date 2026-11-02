import { useSyncExternalStore } from 'react'
import type { MediaItem } from '../data/selection'
const revealed = new Set<string>()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function isMatureGame(item: MediaItem): boolean {
  return (
    item.type === 'game' &&
    Boolean(
      item.isAdult ||
      /\b(?:nsfw|hentai|porn(?:ographic|ography)?|erotic|erotica|futa|futanari)\b|\badults?\s*only\b|\b(?:explicit|strong) sexual\b|\bsexual content\b/i.test(
        [item.title, ...item.genres].join(' '),
      ),
    )
  )
}
export function useCoverGate(item?: MediaItem) {
  const visible = useSyncExternalStore(
    subscribe,
    () => revealed.has(item?.id ?? ''),
    () => false,
  )
  return {
    blocked: Boolean(item && isMatureGame(item) && !visible),
    reveal: () => {
      if (!item) return
      revealed.add(item.id)
      listeners.forEach((listener) => listener())
    },
  }
}
