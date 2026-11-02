import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaItem } from '../data/selection'
import { emptyFeedback } from '../data/library'
import type { LibraryFeedback } from '../data/library'
import { useAuth } from './auth-context'
import { useSavedMedia } from './usePreferences'
import {
  importAccountItems,
  loadAccountLibrary,
  removeAccountItem,
  saveAccountItem,
  updateAccountItem,
  saveTaste,
  completeAccountItem,
} from '../services/account'
import { getSavedCatalog } from '../services/catalog'
export function useLibrary() {
  const auth = useAuth()
  const guest = useSavedMedia()
  const userId = auth.session?.user.id
  const currentUser = useRef(userId)
  useEffect(() => {
    currentUser.current = userId
  }, [userId])
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const cloud = useQuery({
    queryKey: ['account-library', userId],
    queryFn: ({ signal }) => loadAccountLibrary(signal, userId),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  })
  const cloudItems = cloud.data ?? []
  async function toggleSaved(item: MediaItem) {
    if (pending) return
    if (!userId) {
      throw new Error('Entre ou crie uma conta para guardar e avaliar obras.')
    }
    if (!cloud.data)
      throw new Error('Aguarde sua lista carregar antes de guardar títulos.')
    const removing = cloud.data.some((entry) => entry.id === item.id)
    setPending(true)
    try {
      await queryClient.cancelQueries({
        queryKey: ['account-library', userId],
        exact: true,
      })
      const saved = removing ? null : await saveAccountItem(item, userId)
      if (removing) await removeAccountItem(item.id, userId)
      if (currentUser.current !== userId) return
      queryClient.setQueryData<MediaItem[]>(
        ['account-library', userId],
        (current) =>
          saved
            ? [
                { ...saved, library: { ...emptyFeedback } },
                ...(current ?? []).filter((entry) => entry.id !== saved.id),
              ]
            : (current ?? []).filter((entry) => entry.id !== item.id),
      )
    } finally {
      setPending(false)
    }
  }
  async function updateFeedback(
    item: MediaItem,
    update: Partial<LibraryFeedback>,
  ) {
    if (!userId)
      throw new Error('Entre na sua conta para registrar seus gostos.')
    if (pending) throw new Error('Aguarde a atualização anterior terminar.')
    if (!cloud.data?.some((entry) => entry.id === item.id))
      throw new Error('Guarde o título na lista antes de avaliar.')
    setPending(true)
    try {
      await queryClient.cancelQueries({
        queryKey: ['account-library', userId],
        exact: true,
      })
      const library = await updateAccountItem(item.id, update, userId)
      if (currentUser.current !== userId) return
      queryClient.setQueryData<MediaItem[]>(
        ['account-library', userId],
        (current) =>
          current?.map((entry) =>
            entry.id === item.id ? { ...entry, library } : entry,
          ),
      )
    } finally {
      setPending(false)
    }
  }
  async function importGuest() {
    if (!userId || pending) return
    setPending(true)
    try {
      const page = await getSavedCatalog(
        guest.saved,
        { limit: Math.max(1, guest.saved.length) },
        undefined,
        guest.savedSnapshots,
      )
      if (page.items.length !== new Set(guest.saved).size)
        throw new Error(
          'Não conseguimos recuperar todos os títulos locais. Sua lista foi preservada; tente novamente.',
        )
      await importAccountItems(page.items, userId)
      const confirmed = await loadAccountLibrary(undefined, userId)
      if (currentUser.current !== userId)
        throw new Error(
          'A conta mudou durante a importação. A lista local foi preservada.',
        )
      if (
        !page.items.every((item) =>
          confirmed.some((saved) => saved.id === item.id),
        )
      )
        throw new Error(
          'Ainda não conseguimos confirmar a transferência. Sua lista local foi preservada.',
        )
      queryClient.setQueryData(['account-library', userId], confirmed)
      guest.clearSaved()
    } finally {
      setPending(false)
    }
  }
  async function chooseTaste(
    item: MediaItem,
    update: Pick<Partial<LibraryFeedback>, 'rating' | 'isFavorite'>,
  ) {
    if (!userId) throw new Error('Entre na conta para guardar suas escolhas.')
    if (pending) throw new Error('Aguarde a escolha anterior terminar.')
    if (!cloud.data)
      throw new Error('Aguarde sua lista carregar antes de escolher.')
    setPending(true)
    try {
      await queryClient.cancelQueries({
        queryKey: ['account-library', userId],
        exact: true,
      })
      const saved = await saveTaste(item, update, userId)
      if (currentUser.current !== userId) return
      queryClient.setQueryData<MediaItem[]>(
        ['account-library', userId],
        (current) => [
          saved,
          ...(current ?? []).filter(
            (entry) => entry.id !== saved.id && entry.id !== item.id,
          ),
        ],
      )
    } finally {
      setPending(false)
    }
  }
  async function markCompleted(
    item: MediaItem,
    reaction: LibraryFeedback['reaction'] = null,
  ) {
    if (!userId) throw new Error('Entre na conta para registrar suas obras.')
    if (pending || !cloud.data) throw new Error('Aguarde sua lista carregar.')
    setPending(true)
    try {
      await queryClient.cancelQueries({
        queryKey: ['account-library', userId],
        exact: true,
      })
      const saved = await completeAccountItem(item, reaction, userId)
      if (currentUser.current !== userId)
        throw new Error('A conta mudou. Atualize a página.')
      queryClient.setQueryData<MediaItem[]>(
        ['account-library', userId],
        (current) => [
          saved,
          ...(current ?? []).filter(
            (entry) => entry.id !== item.id && entry.id !== saved.id,
          ),
        ],
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['account-recommendations', userId],
        }),
        queryClient.invalidateQueries({ queryKey: ['account-people', userId] }),
        queryClient.invalidateQueries({
          queryKey: ['account-feedback', userId],
        }),
        queryClient.invalidateQueries({ queryKey: ['public-profile'] }),
      ])
    } finally {
      setPending(false)
    }
  }
  return {
    saved: userId ? cloudItems.map((item) => item.id) : [],
    savedSnapshots: userId ? cloudItems : [],
    toggleSaved,
    updateFeedback,
    chooseTaste,
    markCompleted,
    signedIn: Boolean(userId),
    loading: auth.loading || Boolean(userId && cloud.isPending),
    error: userId ? cloud.error : null,
    pending,
    refresh: () => cloud.refetch(),
    guestCount: guest.saved.length,
    importGuest,
  }
}
