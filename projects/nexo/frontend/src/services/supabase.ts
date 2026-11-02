import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
let client: SupabaseClient | null | undefined
const memoryStorage = new Map<string, string>()
const sessionStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return memoryStorage.get(key) ?? null
    }
  },
  setItem(key: string, value: string) {
    memoryStorage.set(key, value)
    try {
      localStorage.setItem(key, value)
    } catch {
      return
    }
  },
  removeItem(key: string) {
    memoryStorage.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      return
    }
  },
}
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  client =
    typeof url === 'string' &&
    url.startsWith('https://') &&
    typeof key === 'string' &&
    key.startsWith('sb_publishable_')
      ? createClient(url, key, {
          auth: {
            flowType: 'pkce',
            detectSessionInUrl: false,
            persistSession: true,
            autoRefreshToken: true,
            storage: sessionStorage,
          },
        })
      : null
  return client
}
export function authMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'invalid_credentials') return 'E-mail ou senha incorretos.'
  if (code === 'email_not_confirmed')
    return 'Confirme seu e-mail antes de entrar.'
  if (code === 'user_already_exists')
    return 'Não foi possível criar a conta. Tente entrar ou recuperar sua senha.'
  if (code === 'weak_password')
    return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.'
  if (code.includes('rate_limit') || code === 'over_email_send_rate_limit')
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'
  if (code === 'email_address_not_authorized')
    return 'O envio de e-mail para este endereço ainda não está disponível. Tente com o e-mail usado no projeto.'
  return 'Não foi possível concluir. Confira os dados e tente novamente.'
}
const exchanges = new Map<string, Promise<void>>()
export function completeAuthCallback(url: string): Promise<void> {
  const parsed = new URL(url)
  const code = parsed.searchParams.get('code')
  const hash = new URLSearchParams(parsed.hash.slice(1))
  if (parsed.searchParams.has('error') || hash.has('error')) {
    return Promise.reject(
      new Error('Este link não é mais válido. Solicite outro.'),
    )
  }
  if (!code)
    return Promise.reject(
      new Error(
        'Não encontramos a confirmação neste link. Abra o link recebido no e-mail no mesmo navegador.',
      ),
    )
  const existing = exchanges.get(code)
  if (existing) return existing
  const promise = (async () => {
    const supabase = getSupabase()
    if (!supabase)
      throw new Error('O acesso à conta está indisponível no momento.')
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error)
      throw new Error(
        'Este link expirou ou foi aberto em outro navegador. Solicite outro e abra aqui.',
      )
  })()
  exchanges.set(code, promise)
  if (exchanges.size > 20) exchanges.delete(exchanges.keys().next().value!)
  return promise
}
