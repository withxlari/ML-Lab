import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import seed from '../../../backend/app/data/catalog.json'
import { toMediaItem } from '../services/catalog'
import { HeroFan, CoverMarquee } from './HeroFan'
afterEach(() => vi.unstubAllGlobals())
test('cover strip has no pause controls and repeats enough covers for wide screens', () => {
  vi.stubGlobal('innerWidth', 3840)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  const { container } = render(
    <CoverMarquee items={seed.slice(0, 1).map(toMediaItem)} />,
  )
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  const groups = container.querySelectorAll('.cover-marquee-group')
  expect(groups).toHaveLength(2)
  expect(groups[0]!.querySelectorAll('img').length * 132).toBeGreaterThan(3840)
  expect(groups[0]!.innerHTML).toBe(groups[1]!.innerHTML)
})
test('brings the selected cover to the front and links its caption to the corresponding category', async () => {
  const items = seed.slice(0, 5).map(toMediaItem)
  const second = items[1]!
  render(
    <MemoryRouter>
      <HeroFan items={items} />
    </MemoryRouter>,
  )
  await userEvent.click(
    screen.getByRole('button', {
      name: `Trazer ${second.title} para a frente`,
    }),
  )
  expect(screen.getByRole('button', { name: second.title })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('link', { name: second.title })).toHaveAttribute(
    'href',
    `/explore?type=${second.type}`,
  )
})
test('follows the mouse with reduced motion enabled, resets on exit and ignores touch', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  )
  const items = seed.slice(0, 5).map(toMediaItem)
  render(
    <MemoryRouter>
      <HeroFan items={items} />
    </MemoryRouter>,
  )
  const cover = screen.getByRole('button', {
    name: `Trazer ${items[0]!.title} para a frente`,
  })
  const stage = cover.closest('.hero-fan-stage')!
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 600,
    bottom: 450,
    width: 500,
    height: 400,
    toJSON: () => ({}),
  })
  function move(pointerType: 'mouse' | 'touch') {
    const event = createEvent.pointerMove(stage)
    Object.defineProperties(event, {
      pointerType: { value: pointerType },
      clientX: { value: 600 },
      clientY: { value: 50 },
    })
    fireEvent(stage, event)
  }
  move('mouse')
  expect(cover.style.transform).toContain('rotateY(10deg) rotateX(8deg)')
  fireEvent.pointerOut(stage, { relatedTarget: null })
  expect(cover.style.transform).toContain('rotateY(0deg) rotateX(0deg)')
  move('touch')
  expect(cover.style.transform).toContain('rotateY(0deg) rotateX(0deg)')
})
