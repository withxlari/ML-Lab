import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiStatus } from './ApiStatus'

afterEach(() => vi.unstubAllGlobals())

function renderStatus() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  )
}

test('shows loading and confirms the API response contract', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'nexo-api',
          version: '0.1.0',
        }),
      ),
    ),
  )
  renderStatus()
  expect(screen.getByRole('status')).toHaveTextContent('Verificando conexão')
  expect(
    await screen.findByText('API conectada. A base do Nexo está no ar.'),
  ).toBeInTheDocument()
})

test('reports failure and lets the user retry successfully', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ok', service: 'nexo-api', version: '0.1.0' }),
      ),
    )
  vi.stubGlobal('fetch', fetchMock)
  renderStatus()
  expect(await screen.findByText(/API indisponível/)).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Verificar novamente' }),
  )
  expect(await screen.findByText(/API conectada/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('does not show success for an invalid response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }))),
  )
  renderStatus()
  expect(await screen.findByText(/API indisponível/)).toBeInTheDocument()
})

test('does not show success for an HTTP error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
  )
  renderStatus()
  expect(await screen.findByText(/API indisponível/)).toBeInTheDocument()
})
