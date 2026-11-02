import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { MediaCard, Cover, CoverReveal } from './MediaCard'

test('a failed book cover tries one ISBN alternative and accepts a fresh image later', () => {
  const item = {
    ...toMediaItem(seed[0]),
    type: 'book' as const,
    isbn13: '9780062662590',
    backdrop: undefined,
  }
  const view = render(<Cover item={item} />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    'https://covers.openlibrary.org/b/isbn/9780062662590-L.jpg?default=false',
  )
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAccessibleName(
    `Capa indisponível: ${item.title}`,
  )
  view.rerender(
    <Cover
      item={{
        ...item,
        image: 'https://books.google.com/books/content?id=fresh',
      }}
    />,
  )
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    'https://books.google.com/books/content?id=fresh',
  )
})

test.each(['movie', 'series', 'book', 'manga', 'game'] as const)(
  '%s can use its alternate artwork after a cover error and recover with a new cover',
  (type) => {
    const item = {
      ...toMediaItem(seed[0]),
      type,
      backdrop: 'https://image.tmdb.org/t/p/w1280/alternate.jpg',
    }
    const view = render(<Cover item={item} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img')).toHaveAttribute('src', item.backdrop)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img')).toHaveAccessibleName(
      `Capa indisponível: ${item.title}`,
    )
    view.rerender(<Cover item={{ ...item, image: '/images/recovered.jpg' }} />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/images/recovered.jpg',
    )
  },
)
test('adult cover stays blurred on hover and a click reveals without opening details or saving', async () => {
  const item = {
    ...toMediaItem(seed[0]),
    id: 'adult-card-test',
    title: 'Jogo adulto',
    type: 'game' as const,
    isAdult: true,
  }
  const onOpen = vi.fn(),
    onSave = vi.fn()
  render(
    <MediaCard item={item} saved={false} onOpen={onOpen} onSave={onSave} />,
  )
  const image = screen.getByAltText('Capa de Jogo adulto')
  expect(image).toHaveClass('mature-image-blurred')
  fireEvent.mouseEnter(image)
  expect(image).toHaveClass('mature-image-blurred')
  await userEvent.click(
    screen.getByRole('button', { name: 'Revelar capa +18 de Jogo adulto' }),
  )
  expect(screen.getByAltText('Capa de Jogo adulto')).not.toHaveClass(
    'mature-image-blurred',
  )
  expect(onOpen).not.toHaveBeenCalled()
  expect(onSave).not.toHaveBeenCalled()
})
test('legacy explicit games are protected in detail views without rating metadata', async () => {
  const item = {
    ...toMediaItem(seed[0]),
    id: 'legacy-adult-test',
    title: 'Femboy Futa House',
    type: 'game' as const,
  }
  render(
    <div className="modal-poster-frame">
      <Cover item={item} />
      <CoverReveal item={item} />
    </div>,
  )
  expect(screen.getByAltText('Capa de Femboy Futa House')).toHaveClass(
    'mature-image-blurred',
  )
  const reveal = screen.getByRole('button', {
    name: 'Revelar capa +18 de Femboy Futa House',
  })
  reveal.focus()
  await userEvent.keyboard('{Enter}')
  expect(
    screen.queryByRole('button', { name: /Revelar capa/ }),
  ).not.toBeInTheDocument()
})
test('ordinary games are shown without an adult warning', () => {
  const item = {
    ...toMediaItem(seed[0]),
    id: 'safe-game-test',
    title: 'Femboy Fashion',
    type: 'game' as const,
  }
  render(
    <MediaCard item={item} saved={false} onOpen={vi.fn()} onSave={vi.fn()} />,
  )
  expect(
    screen.queryByRole('button', { name: /Revelar capa/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByAltText('Capa de Femboy Fashion')).not.toHaveClass(
    'mature-image-blurred',
  )
})
