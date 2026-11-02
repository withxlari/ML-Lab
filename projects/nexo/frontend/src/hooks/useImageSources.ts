import { useState } from 'react'

export function useImageSources(sources: (string | undefined)[]) {
  const [failed, setFailed] = useState<string[]>([])
  const source = sources.find((value) => value && !failed.includes(value))
  return {
    source,
    onError: () => {
      if (source) setFailed((current) => [...current, source])
    },
  }
}
