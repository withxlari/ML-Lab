import { accountRequest, validateProfile } from './account'
import { getSupabase } from './supabase'
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Escolha uma imagem JPG, PNG ou WebP.')
  if (file.size > 8 * 1024 * 1024)
    throw new Error('Escolha uma imagem de até 8 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Não conseguimos abrir esta imagem. Escolha outra foto.')
  }
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 64000000
    )
      throw new Error('Esta imagem é grande demais. Escolha uma versão menor.')
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Não conseguimos preparar sua foto neste navegador.')
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    )
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('Não conseguimos preparar esta foto.')),
        'image/webp',
        0.85,
      ),
    )
    if (blob.type !== 'image/webp' || blob.size > 1048576)
      throw new Error(
        'Não conseguimos reduzir esta imagem. Escolha outra foto.',
      )
    return blob
  } finally {
    bitmap.close()
  }
}
async function accountClient(user: string) {
  const client = getSupabase()
  if (!client) throw new Error('Entre na sua conta para continuar.')
  const {
    data: { session },
    error,
  } = await client.auth.getSession()
  if (error || session?.user.id !== user)
    throw new Error('A conta mudou. Atualize a página antes de continuar.')
  return client
}
export async function changeAvatar(
  user: string,
  file: File,
  previous?: string | null,
) {
  const blob = await prepareAvatar(file)
  const client = await accountClient(user)
  const storage = client.storage.from('avatars')
  const path = `${user}/${crypto.randomUUID()}.webp`
  const { error } = await storage.upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '120',
    upsert: false,
  })
  if (error) throw new Error('Não conseguimos enviar a foto. Tente novamente.')
  const profile = validateProfile(
    await accountRequest(
      '/avatar',
      'PATCH',
      { avatar_path: path },
      undefined,
      user,
    ),
  )
  if (previous?.startsWith(`${user}/`))
    await storage.remove([previous]).catch(() => {})
  return profile
}
export async function removeAvatar(user: string, previous?: string | null) {
  const client = await accountClient(user)
  const profile = validateProfile(
    await accountRequest(
      '/avatar',
      'PATCH',
      { avatar_path: null },
      undefined,
      user,
    ),
  )
  if (previous?.startsWith(`${user}/`))
    await client.storage
      .from('avatars')
      .remove([previous])
      .catch(() => {})
  return profile
}
