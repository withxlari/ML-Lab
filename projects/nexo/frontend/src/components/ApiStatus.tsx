import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../services/api'
export function ApiStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    staleTime: 30000,
  })
  return (
    <aside className="api-status" aria-label="Ambiente de desenvolvimento">
      <div>
        <span className="eyebrow">AMBIENTE LOCAL · FASE 0</span>
        <p role="status" aria-live="polite">
          {health.isPending
            ? 'Verificando conexão com a API…'
            : health.isError
              ? 'API indisponível. Verifique se o back-end está em execução.'
              : 'API conectada. A base do Nexo está no ar.'}
        </p>
        <small>Esta verificação confirma apenas o funcionamento da API.</small>
      </div>
      <button
        className="secondary-button"
        disabled={health.isFetching}
        onClick={() => void health.refetch()}
      >
        {health.isFetching ? 'Verificando…' : 'Verificar novamente'}
      </button>
    </aside>
  )
}
