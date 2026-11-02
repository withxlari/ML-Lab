export interface HealthResponse {
  status: 'ok'
  service: 'nexo-api'
  version: string
}
function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'ok' &&
    'service' in value &&
    value.service === 'nexo-api' &&
    'version' in value &&
    typeof value.version === 'string'
  )
}
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/health`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    throw new Error('Não foi possível acessar a API do Nexo.')
  }
  const data: unknown = await response.json()
  if (!isHealthResponse(data)) {
    throw new Error('A API retornou uma resposta inesperada.')
  }
  return data
}
