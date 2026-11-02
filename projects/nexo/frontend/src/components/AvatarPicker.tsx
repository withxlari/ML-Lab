import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from './Avatar'
import type { Profile } from '../services/account'
import { changeAvatar, removeAvatar } from '../services/avatar'
export function AvatarPicker({
  user,
  profile,
  disabled,
}: {
  user: string
  profile?: Profile
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function change(file?: File) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updated = file
        ? await changeAvatar(user, file, profile?.avatar_path)
        : await removeAvatar(user, profile?.avatar_path)
      client.setQueryData(['account-profile', user], updated)
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['account-public-profile', user],
        }),
        client.invalidateQueries({ queryKey: ['public-profile'] }),
      ])
      setMessage(file ? 'Foto de perfil atualizada.' : 'Foto removida.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar sua foto.',
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <section className="account-avatar-section" aria-label="Foto de perfil">
      <div className="account-avatar-row">
        <Avatar
          src={profile?.avatar_url}
          name={profile?.display_name ?? 'Nexo'}
        />
        <div>
          <h2>Sua foto</h2>
          <p>
            JPG, PNG ou WebP · até 8 MB.
            <br />A imagem será recortada ao centro.
          </p>
          <div className="avatar-picker-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy || disabled}
              onClick={() => input.current?.click()}
            >
              {busy
                ? 'Atualizando…'
                : profile?.avatar_path
                  ? 'Trocar foto'
                  : 'Escolher foto'}
            </button>
            {profile?.avatar_path && (
              <button
                type="button"
                className="text-button"
                disabled={busy || disabled}
                onClick={() => void change()}
              >
                Remover
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        className="sr-only"
        type="file"
        ref={input}
        accept="image/jpeg,image/png,image/webp"
        aria-label="Escolher imagem de perfil"
        disabled={busy || disabled}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) void change(file)
        }}
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
