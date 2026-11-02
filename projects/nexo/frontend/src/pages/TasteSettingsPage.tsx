import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/auth-context'
import type { MediaType } from '../data/selection'
import {
  categories,
  emptyTaste,
  getTastes,
  saveTastes,
  getFeedback,
  deleteFeedback,
} from '../services/community'
import type { CategoryTaste, Tastes } from '../services/community'
export function TasteSettingsPage() {
  const { session, loading } = useAuth()
  const user = session?.user.id
  const query = useQuery({
    queryKey: ['account-tastes', user],
    queryFn: ({ signal }) => getTastes(user!, signal),
    enabled: !!user,
  })
  if (loading || (user && query.isPending))
    return (
      <section className="lv-page community-page" role="status">
        Abrindo seus gostos…
      </section>
    )
  if (!user)
    return (
      <section className="lv-page community-page">
        <h1>Seus gostos</h1>
        <p>Entre para guardar o que você gosta de encontrar.</p>
        <Link className="btn btn-primary" to="/account">
          Entrar
        </Link>
      </section>
    )
  if (query.isError)
    return (
      <section className="lv-page community-page" role="alert">
        <p>Não conseguimos abrir seus gostos.</p>
        <button
          className="btn btn-outline"
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </button>
      </section>
    )
  return <TasteForm key={user} user={user} initial={query.data!} />
}
function TasteForm({ user, initial }: { user: string; initial: Tastes }) {
  const client = useQueryClient()
  const [data, setData] = useState(initial)
  const [category, setCategory] = useState<MediaType>('movie')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const history = useQuery({
    queryKey: ['account-feedback', user],
    queryFn: ({ signal }) => getFeedback(user, signal),
  })
  const taste = data.categories[category] ?? emptyTaste()
  function change(key: keyof CategoryTaste, tags: string[]) {
    setData({
      ...data,
      categories: { ...data.categories, [category]: { ...taste, [key]: tags } },
    })
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveTastes(user, data)
      await client.invalidateQueries({
        queryKey: ['account-recommendations', user],
      })
      client.setQueryData(['account-tastes', user], data)
      setMessage(
        'Seus gostos foram salvos. As próximas sugestões já vão considerar suas escolhas.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function undo(slug: string) {
    setBusy(true)
    setError('')
    try {
      await deleteFeedback(user, slug)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['account-feedback', user] }),
        client.invalidateQueries({
          queryKey: ['account-recommendations', user],
        }),
      ])
      setMessage('Ajuste desfeito.')
    } catch {
      setError('Não foi possível desfazer. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="lv-page community-page">
      <header className="community-heading">
        <div>
          <p className="eyebrow text-primary">DO SEU JEITO</p>
          <h1>Seus gostos, com detalhes.</h1>
          <p>
            O que faz uma história ficar com você? Conte também o que prefere
            evitar.
          </p>
        </div>
        <Link className="btn btn-outline" to="/account?section=profile">
          Organizar meu Top 5
        </Link>
      </header>
      <form onSubmit={submit} className="community-form">
        <div
          className="lv-filter-group community-tabs"
          role="group"
          aria-label="Categoria dos gostos"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? 'filter-active' : ''}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="community-columns">
          <section className="community-panel">
            <p className="eyebrow text-primary">QUERO ENCONTRAR</p>
            <h2>Mais disso, por favor.</h2>
            <TagField
              key={`${category}-genres`}
              label="Gêneros e subgêneros que gosto"
              value={taste.liked_genres}
              onChange={(tags) => change('liked_genres', tags)}
              placeholder="Ex.: suspense psicológico"
            />
            <TagField
              key={`${category}-themes`}
              label="Temas e detalhes que me atraem"
              value={taste.liked_themes}
              onChange={(tags) => change('liked_themes', tags)}
              placeholder="Ex.: amizades improváveis"
            />
          </section>
          <section className="community-panel">
            <p className="eyebrow">PREFIRO EVITAR</p>
            <h2>Não é muito a minha praia.</h2>
            <TagField
              key={`${category}-avoid-genres`}
              label="Gêneros que prefiro evitar"
              value={taste.avoided_genres}
              onChange={(tags) => change('avoided_genres', tags)}
              placeholder="Ex.: terror"
            />
            <TagField
              key={`${category}-avoid-themes`}
              label="Temas que prefiro evitar"
              value={taste.avoided_themes}
              onChange={(tags) => change('avoided_themes', tags)}
              placeholder="Ex.: competição esportiva"
            />
          </section>
        </div>
        <section className="community-panel">
          <h2>Com suas palavras.</h2>
          <p>
            Estes textos são privados. Descreva o que procura em qualquer
            formato, sem precisar acertar o nome de um gênero.
          </p>
          <label>
            O que gosto de encontrar
            <textarea
              maxLength={2000}
              value={data.like_text}
              onChange={(e) => setData({ ...data, like_text: e.target.value })}
              placeholder="Gosto de histórias mais lentas, personagens contraditórios e finais que ficam na cabeça."
              rows={4}
            />
          </label>
          <label>
            O que prefiro evitar
            <textarea
              maxLength={2000}
              value={data.avoid_text}
              onChange={(e) => setData({ ...data, avoid_text: e.target.value })}
              placeholder="Aqui você pode contar o que costuma te afastar de uma obra."
              rows={3}
            />
          </label>
          <p className="community-help">
            O modelo compara o sentido dos textos; pode errar detalhes. Gêneros
            reconhecidos que você evita são filtrados. Temas evitados reduzem a
            afinidade, mas não garantem a ausência daquele conteúdo.
          </p>
        </section>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="community-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar meus gostos'}
          </button>
          <Link className="btn btn-outline" to="/recommendations">
            Ver minhas sugestões
          </Link>
          <Link className="text-button" to="/library">
            Avaliar obras da minha lista →
          </Link>
        </div>
      </form>
      <section className="community-history">
        <h2>Seus ajustes nas sugestões</h2>
        <p>
          Você pode mudar de ideia. Desfazer libera a obra e remove o efeito
          desse ajuste.
        </p>
        {history.isPending ? (
          <p role="status">Abrindo ajustes…</p>
        ) : history.isError ? (
          <p role="alert">
            Não conseguimos abrir seus ajustes.{' '}
            <button onClick={() => void history.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !history.data?.length ? (
          <p>Nenhum ajuste por enquanto.</p>
        ) : (
          history.data.map((row) => (
            <div key={row.media_key} className="community-history-row">
              <div>
                <strong>{row.item.title}</strong>
                <p>
                  {
                    {
                      more_like_this: 'Mais assim',
                      not_interested: 'Não me interessa',
                      already_known: 'Já conheço',
                    }[row.action]
                  }
                </p>
              </div>
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() => void undo(row.media_key)}
              >
                Desfazer
              </button>
            </div>
          ))
        )}
      </section>
    </section>
  )
}
function TagField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string[]
  onChange: (tags: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const next = draft.trim()
    if (
      next &&
      value.length < 20 &&
      !value.some((t) => t.toLocaleLowerCase() === next.toLocaleLowerCase())
    ) {
      onChange([...value, next])
      setDraft('')
    }
  }
  return (
    <div className="community-tag-field">
      <label>
        {label}
        <span className="community-tag-input">
          <input
            value={draft}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button
            className="btn btn-outline"
            type="button"
            disabled={!draft.trim() || value.length >= 20}
            onClick={add}
          >
            Adicionar
          </button>
        </span>
      </label>
      <div className="community-tags">
        {value.map((tag) => (
          <button
            type="button"
            key={tag}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remover ${tag}`}
          >
            {tag}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    </div>
  )
}
