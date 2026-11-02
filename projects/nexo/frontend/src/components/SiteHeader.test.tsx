import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import { SiteHeader } from './SiteHeader'
test('closes the mobile navigation with Escape and returns focus to its control', async () => {
  render(
    <MemoryRouter>
      <SiteHeader
        page="explore"
        signedIn={false}
        theme="dark"
        toggleTheme={vi.fn()}
      />
    </MemoryRouter>,
  )
  const toggle = screen.getByRole('button', { name: 'Abrir menu' })
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await userEvent.tab({ shift: true })
  await userEvent.keyboard('{Escape}')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(toggle).toHaveFocus()
  await userEvent.click(toggle)
  await userEvent.click(
    screen
      .getByRole('navigation', { name: 'Navegação no celular' })
      .querySelector('a[href="/account"]')!,
  )
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
