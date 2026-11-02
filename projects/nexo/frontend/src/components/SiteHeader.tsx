import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from './Icon'
const nav = [
  { to: '/explore', id: 'explore', label: 'Explorar' },
  { to: '/library', id: 'library', label: 'Minha lista' },
  { to: '/recommendations', id: 'recommendations', label: 'Para você' },
]
export function Wordmark() {
  return (
    <span className="font-display text-3xl font-medium italic leading-none tracking-tight">
      nexo
    </span>
  )
}
export function SiteHeader({
  page,
  signedIn,
  theme,
  toggleTheme,
}: {
  page: string
  signedIn: boolean
  theme: string
  toggleTheme: () => void
}) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  return (
    <header
      className="lv-header sticky top-0 z-30 border-b bg-background/90 backdrop-blur"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false)
          toggle.current?.focus()
        }
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Nexo, início" className="text-primary">
          <Wordmark />
        </Link>
        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-1 md:flex"
        >
          {nav.map((entry) => (
            <Link
              key={entry.id}
              to={entry.to}
              className={`btn btn-ghost text-sm ${page === entry.id ? 'nav-active' : ''}`}
              aria-current={page === entry.id ? 'page' : undefined}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-ghost w-11 px-0"
            aria-label={`Ativar modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
          </button>
          <Link
            to="/account"
            className="btn btn-outline hidden text-sm sm:inline-flex"
          >
            {signedIn ? 'Minha conta' : 'Entrar'}
          </Link>
          <button
            ref={toggle}
            id="mobile-menu-toggle"
            type="button"
            className="btn btn-ghost w-11 px-0 md:hidden"
            aria-expanded={open}
            aria-controls="menu-movel"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="menu-movel"
          aria-label="Navegação no celular"
          className="border-t px-4 py-3 md:hidden"
        >
          {nav.map((entry) => (
            <Link
              key={entry.id}
              to={entry.to}
              className="block py-3 font-display text-2xl"
              onClick={() => setOpen(false)}
            >
              {entry.label}
            </Link>
          ))}
          <Link
            to="/account"
            onClick={() => setOpen(false)}
            className="block py-3 font-display text-2xl"
          >
            {signedIn ? 'Minha conta' : 'Entrar'}
          </Link>
        </nav>
      )}
    </header>
  )
}
