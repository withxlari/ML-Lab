import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterAll, expect, test, vi } from 'vitest'
import { Modal } from './Modal'
const originalShow = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
)
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
)
afterAll(() => {
  for (const [name, descriptor] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
})
test('does not treat StrictMode effect cleanup as a user dismissal', () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
  const onClose = vi.fn()
  const view = render(
    <StrictMode>
      <Modal titleId="test-title" onClose={onClose}>
        <h2 id="test-title">Detalhes da obra</h2>
      </Modal>
    </StrictMode>,
  )
  expect(
    screen.getByRole('dialog', { name: 'Detalhes da obra' }),
  ).toHaveAttribute('open')
  expect(onClose).not.toHaveBeenCalled()
  view.unmount()
  expect(onClose).not.toHaveBeenCalled()
})
