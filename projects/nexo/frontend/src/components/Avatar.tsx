import { useState } from 'react'
export function Avatar({
  src,
  name,
  className = '',
}: {
  src?: string | null
  name: string
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className={`profile-avatar ${className}`}>
      {src && src !== failed ? (
        <img
          src={src}
          alt={`Foto de perfil de ${name}`}
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden="true">
          {name.trim().slice(0, 1).toLocaleUpperCase() || 'N'}
        </span>
      )}
    </span>
  )
}
