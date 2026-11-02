import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Wordmark } from '../components/SiteHeader'
import { HeroFan } from '../components/HeroFan'
import type { MediaItem } from '../data/selection'
import { useAuth } from '../hooks/auth-context'
import {
  authMessage,
  completeAuthCallback,
  getSupabase,
} from '../services/supabase'
import { loadProfile, updateProfile } from '../services/account'
import { getOwnProfile } from '../services/community'
import { AvatarPicker } from '../components/AvatarPicker'
import { ProfileSettingsPage } from './ProfilePage'
import type { useLibrary } from '../hooks/useLibrary'
export function AccountPage({
  guestCount,
  importGuest,
  pending,
  selection = [],
  library,
}: {
  guestCount: number
  importGuest: () => Promise<void>
  pending: boolean
  selection?: MediaItem[]
  library?: ReturnType<typeof useLibrary>
}) {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const section = params.get('section')
  const activeSection =
    section === 'profile' || section === 'privacy' || section === 'favorites'
      ? section
      : 'account'
  const navigate = useNavigate()
  const mode = params.get('mode') ?? 'login'
  const client = getSupabase()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const profile = useQuery({
    queryKey: ['account-profile', auth.session?.user.id],
    queryFn: ({ signal }) => loadProfile(signal, auth.session?.user.id),
    enabled: Boolean(auth.session),
    retry: false,
  })
  const publicProfile = useQuery({
    queryKey: ['account-public-profile', auth.session?.user.id],
    queryFn: ({ signal }) => getOwnProfile(auth.session!.user.id, signal),
    enabled: Boolean(auth.session) && mode !== 'password',
    retry: false,
    staleTime: 30000,
  })
  const resetting = mode === 'password'
  const signup = mode === 'signup'
  const recover = mode === 'recover'
  const welcome = params.get('welcome') === '1'
  useEffect(() => {
    if (welcome && auth.session && !resetting)
      navigate('/account', { replace: true })
  }, [welcome, auth.session, resetting, navigate])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!client) {
      setError('O acesso à conta está indisponível no momento.')
      return
    }
    if ((signup || resetting) && password !== confirmation) {
      setError('As senhas precisam ser iguais.')
      return
    }
    setBusy(true)
    try {
      if (resetting) {
        if (!auth.session)
          throw new Error(
            'Abra um novo link de recuperação recebido no e-mail.',
          )
        const result = await client.auth.updateUser({ password })
        if (result.error) {
          setError(authMessage(result.error))
          return
        }
        setPassword('')
        setConfirmation('')
        setMessage('Senha atualizada. Você já pode continuar.')
        navigate('/account', { replace: true })
      } else if (recover) {
        const result = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?flow=recovery`,
        })
        if (result.error) {
          setError(authMessage(result.error))
          return
        }
        setMessage(
          'Se houver uma conta com esse e-mail, você receberá um link para criar outra senha.',
        )
      } else if (signup) {
        const result = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (result.error) {
          setError(authMessage(result.error))
          return
        }
        setPassword('')
        setConfirmation('')
        if (result.data.session) navigate('/account', { replace: true })
        else
          setMessage(
            'Confira seu e-mail para confirmar a conta. Abra o link neste navegador.',
          )
      } else {
        const result = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (result.error) {
          setError(authMessage(result.error))
          return
        }
        setPassword('')
        navigate('/account', { replace: true })
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await updateProfile(
        name ?? profile.data?.display_name ?? '',
        auth.session?.user.id,
      )
      queryClient.setQueryData(
        ['account-profile', auth.session?.user.id],
        result,
      )
      setName(null)
      setMessage('Seu nome foi atualizado.')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (auth.loading)
    return (
      <section className="account-page" role="status">
        Abrindo sua conta…
      </section>
    )
  return (
    <section
      className={
        auth.session && !resetting ? 'account-page lv-page' : 'lv-account-auth'
      }
      aria-labelledby="account-title"
    >
      {auth.session && !resetting ? (
        <div className="account-intro">
          <span className="eyebrow">SEU ESPAÇO NO NEXO</span>{' '}
          <h1 id="account-title">
            {resetting
              ? 'Uma nova senha.'
              : auth.session
                ? 'Tudo o que você quer guardar.'
                : signup
                  ? 'Crie sua conta.'
                  : recover
                    ? 'Recuperar senha.'
                    : 'Bom te ver de novo.'}
          </h1>
          <p>
            Seus favoritos ficam na conta, para você voltar de onde estiver.
          </p>
        </div>
      ) : (
        <div className="lv-account-art grain">
          <Link to="/" aria-label="Voltar ao início">
            <Wordmark />
          </Link>
          <HeroFan items={selection} onDark />
          <p>Sua lista, suas notas e sugestões com o motivo ao lado.</p>
        </div>
      )}
      <div className="account-panel">
        {(!auth.session || resetting) && (
          <>
            <Link
              to="/"
              className="mobile-account-brand text-primary"
              aria-label="Nexo, início"
            >
              <Wordmark />
            </Link>{' '}
            <h1 id="account-title">
              {resetting
                ? 'Uma nova senha.'
                : auth.session
                  ? 'Tudo o que você quer guardar.'
                  : signup
                    ? 'Crie sua conta.'
                    : recover
                      ? 'Recuperar senha.'
                      : 'Bom te ver de novo.'}
            </h1>
          </>
        )}
        {!auth.session && params.get('reason') === 'library' && (
          <p className="account-message">
            Entre ou crie uma conta para guardar obras, dar notas e escrever
            avaliações.
          </p>
        )}
        {message && (
          <p className="account-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {auth.session && !resetting ? (
          <>
            <p className="account-email">{auth.session.user.email}</p>
            {library && (
              <nav
                className="account-settings-tabs"
                aria-label="Configurações da conta"
                role="tablist"
              >
                {(
                  [
                    ['account', 'Conta'],
                    ['profile', 'Perfil'],
                    ['privacy', 'Privacidade'],
                    ['favorites', 'Top 5'],
                  ] as const
                ).map(([id, label], index) => (
                  <button
                    key={id}
                    id={`account-tab-${id}`}
                    role="tab"
                    type="button"
                    aria-selected={activeSection === id}
                    aria-controls={`account-pane-${id}`}
                    tabIndex={activeSection === id ? 0 : -1}
                    onKeyDown={(event) => {
                      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
                      if (!keys.includes(event.key)) return
                      event.preventDefault()
                      const tabs =
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          '[role="tab"]',
                        )
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? 3
                            : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4
                      tabs?.[next]?.click()
                      tabs?.[next]?.focus()
                    }}
                    onClick={() =>
                      setParams(id === 'account' ? {} : { section: id }, {
                        replace: true,
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
            <div
              id="account-pane-account"
              role={library ? 'tabpanel' : undefined}
              aria-labelledby={library ? 'account-tab-account' : undefined}
              hidden={activeSection !== 'account'}
            >
              <AvatarPicker
                user={auth.session.user.id}
                profile={profile.data}
                disabled={busy || profile.isPending || profile.isError}
              />
              <form onSubmit={saveName} className="account-form">
                <label>
                  Como você quer aparecer?
                  <input
                    type="text"
                    maxLength={80}
                    value={name ?? profile.data?.display_name ?? ''}
                    placeholder={profile.data?.display_name ?? 'Seu nome'}
                    autoComplete="nickname"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button
                  className="outline-button"
                  disabled={busy || profile.isPending}
                >
                  Salvar nome
                </button>
              </form>
              {profile.isError && (
                <p role="alert">
                  Não conseguimos carregar seu perfil.{' '}
                  <button
                    className="text-button"
                    onClick={() => void profile.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              <nav className="account-actions" aria-label="Atalhos da conta">
                {publicProfile.data?.is_public ? (
                  <Link
                    className="outline-button account-public-profile"
                    to={`/u/${publicProfile.data.username}`}
                  >
                    Ver meu perfil público <span aria-hidden="true">↗</span>
                  </Link>
                ) : (
                  <div className="account-public-profile">
                    <button className="outline-button" type="button" disabled>
                      Ver meu perfil público <span aria-hidden="true">↗</span>
                    </button>
                    <p>
                      {publicProfile.isPending
                        ? 'Abrindo seu perfil…'
                        : publicProfile.isError
                          ? 'Não conseguimos conferir seu perfil agora.'
                          : 'Ative “Publicar meu perfil” na aba Privacidade para abrir sua página pública.'}
                      {publicProfile.isError && (
                        <button
                          className="text-button"
                          onClick={() => void publicProfile.refetch()}
                        >
                          Tentar novamente
                        </button>
                      )}
                    </p>
                  </div>
                )}
                <Link
                  className="outline-button account-tastes-link"
                  to="/preferences"
                >
                  Gêneros, temas e gostos
                </Link>
                <Link
                  className="outline-button taste-account-link"
                  to="/library"
                >
                  Abrir minha lista
                </Link>
                <Link className="primary-button" to="/recommendations">
                  Ver minhas sugestões
                </Link>
              </nav>
              {guestCount > 0 && (
                <div className="import-local">
                  <h2>
                    Tem {guestCount}{' '}
                    {guestCount === 1 ? 'título guardado' : 'títulos guardados'}{' '}
                    neste navegador.
                  </h2>
                  <p>
                    Transfira essa lista para a conta de{' '}
                    <strong>{auth.session.user.email}</strong>. A cópia local só
                    será removida depois de confirmar que tudo ficou salvo.
                  </p>
                  <button
                    className="outline-button"
                    disabled={pending || busy}
                    onClick={() => {
                      setError('')
                      void importGuest()
                        .then(() =>
                          setMessage('Sua lista agora está na conta.'),
                        )
                        .catch((cause) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : 'Não foi possível importar.',
                          ),
                        )
                    }}
                  >
                    {pending
                      ? 'Transferindo…'
                      : 'Trazer minha lista para esta conta'}
                  </button>
                </div>
              )}
              <div className="account-links">
                <Link to="/account?mode=password">Alterar senha</Link>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void auth
                      .signOut()
                      .then(() => navigate('/account', { replace: true }))
                      .catch((cause) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : 'Não foi possível sair.',
                        ),
                      )
                      .finally(() => setBusy(false))
                  }}
                >
                  Sair da conta
                </button>
              </div>
            </div>
            {library && (
              <div
                id={`account-pane-${activeSection === 'account' ? 'profile' : activeSection}`}
                role="tabpanel"
                aria-labelledby={`account-tab-${activeSection === 'account' ? 'profile' : activeSection}`}
                hidden={activeSection === 'account'}
              >
                <ProfileSettingsPage
                  library={library}
                  embedded
                  activeSection={
                    activeSection === 'account' ? 'profile' : activeSection
                  }
                />
              </div>
            )}
          </>
        ) : (
          <>
            {!resetting && (
              <nav className="auth-tabs" aria-label="Acesso à conta">
                <Link
                  to="/account"
                  aria-current={!signup && !recover ? 'page' : undefined}
                >
                  Entrar
                </Link>
                <Link
                  to="/account?mode=signup"
                  aria-current={signup ? 'page' : undefined}
                >
                  Criar conta
                </Link>
              </nav>
            )}
            {resetting && !auth.session ? (
              <p role="alert">
                Abra o link de recuperação recebido no e-mail para definir uma
                nova senha.{' '}
                <Link to="/account?mode=recover">Pedir outro link</Link>
              </p>
            ) : (
              <form className="account-form" onSubmit={submit}>
                {!resetting && (
                  <label>
                    E-mail
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  </label>
                )}
                {!recover && (
                  <div>
                    <div className="password-row">
                      <label htmlFor="account-password">
                        {resetting ? 'Nova senha' : 'Senha'}
                      </label>
                      {!signup && !resetting && (
                        <Link to="/account?mode=recover">Esqueci a senha</Link>
                      )}
                    </div>
                    <input
                      id="account-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={signup || resetting ? 8 : 1}
                      maxLength={128}
                      autoComplete={
                        signup || resetting
                          ? 'new-password'
                          : 'current-password'
                      }
                      required
                    />
                  </div>
                )}
                {(signup || resetting) && (
                  <label>
                    Repita a senha
                    <input
                      type="password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}
                {(signup || resetting) && (
                  <p className="account-hint">
                    Use pelo menos 8 caracteres. Uma senha longa e exclusiva
                    protege melhor sua conta.
                  </p>
                )}
                <button
                  className="primary-button"
                  disabled={busy || !auth.configured}
                >
                  {busy
                    ? 'Aguarde…'
                    : resetting
                      ? 'Salvar nova senha'
                      : recover
                        ? 'Enviar link'
                        : signup
                          ? 'Criar minha conta'
                          : 'Entrar'}
                </button>
                {!auth.configured && (
                  <p role="alert">
                    O acesso à conta ainda não está disponível neste ambiente.
                  </p>
                )}
              </form>
            )}
            {!resetting && recover && (
              <Link
                className="text-button"
                to={recover ? '/account' : '/account?mode=recover'}
              >
                {recover ? 'Voltar para entrar' : 'Esqueci minha senha'}
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  )
}
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [callbackUrl] = useState(() => window.location.href)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const recovery =
      new URL(callbackUrl).searchParams.get('flow') === 'recovery'
    window.history.replaceState({}, document.title, '/auth/callback')
    void completeAuthCallback(callbackUrl)
      .then(() => {
        if (active)
          navigate(recovery ? '/account?mode=password' : '/account', {
            replace: true,
          })
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível confirmar este link.',
          )
      })
    return () => {
      active = false
    }
  }, [callbackUrl, navigate])
  return (
    <section className="account-page">
      <h1>
        {error ? 'Não conseguimos abrir esse link.' : 'Confirmando seu acesso…'}
      </h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Link className="primary-button" to="/account?mode=recover">
            Pedir outro link
          </Link>
          <Link to="/account">Voltar para entrar</Link>
        </>
      ) : (
        <p role="status">Só um instante.</p>
      )}
    </section>
  )
}
