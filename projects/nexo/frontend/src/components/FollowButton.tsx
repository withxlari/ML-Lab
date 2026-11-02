import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth } from '../hooks/auth-context'
import {
  getFollowStatus,
  followPerson,
  unfollowPerson,
} from '../services/people'
export function FollowButton({
  username,
  onChanged,
}: {
  username: string
  onChanged?: (following: boolean) => void
}) {
  const { session, loading } = useAuth()
  const user = session?.user.id
  if (loading)
    return (
      <button className="btn btn-outline" disabled>
        …
      </button>
    )
  if (!user)
    return (
      <Link className="btn btn-outline" to="/account">
        Entrar para seguir
      </Link>
    )
  return (
    <SignedFollowButton
      key={`${user}:${username}`}
      user={user}
      username={username}
      onChanged={onChanged}
    />
  )
}
function SignedFollowButton({
  user,
  username,
  onChanged,
}: {
  user: string
  username: string
  onChanged?: (following: boolean) => void
}) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const query = useQuery({
    queryKey: ['account-follow-status', user, username],
    queryFn: ({ signal }) => getFollowStatus(user, username, signal),
    retry: false,
    staleTime: 30000,
  })
  async function toggle() {
    if (!query.data || busy) return
    setBusy(true)
    setError('')
    try {
      const current = query.data
      const next = current.following
        ? (await unfollowPerson(user, current.followed_id),
          { ...current, following: false })
        : await followPerson(user, username)
      client.setQueryData(['account-follow-status', user, username], next)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['account-people', user] }),
        client.invalidateQueries({ queryKey: ['account-following', user] }),
        client.invalidateQueries({ queryKey: ['public-profile', username] }),
        client.invalidateQueries({
          queryKey: ['public-connections', username],
        }),
      ])
      setMessage(
        next.following
          ? 'Você começou a seguir este perfil.'
          : 'Você deixou de seguir este perfil.',
      )
      onChanged?.(next.following)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (query.data?.is_self) return null
  if (query.isError)
    return (
      <div className="follow-control">
        <button className="text-button" onClick={() => void query.refetch()}>
          Conferir seguimento
        </button>
        <span role="alert">Não conseguimos conferir agora.</span>
      </div>
    )
  return (
    <div className="follow-control">
      <button
        className={
          query.data?.following ? 'btn btn-outline' : 'btn btn-primary'
        }
        disabled={query.isPending || busy}
        onClick={() => void toggle()}
        aria-label={`${query.data?.following ? 'Deixar de seguir' : 'Seguir'} @${username}`}
        aria-pressed={query.data?.following ?? false}
      >
        {busy
          ? 'Salvando…'
          : query.isPending
            ? 'Abrindo…'
            : query.data?.following
              ? 'Seguindo ✓'
              : 'Seguir'}
      </button>
      {error && <span role="alert">{error}</span>}
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
    </div>
  )
}
