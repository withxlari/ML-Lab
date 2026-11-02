type IconName =
  | 'progress'
  | 'sun'
  | 'moon'
  | 'bookmark-check'
  | 'menu'
  | 'arrow'
  | 'bookmark'
  | 'check'
  | 'search'
  | 'close'
  | 'theme'
  | 'shuffle'
  | 'chevron'
  | 'external'
  | 'heart'
  | 'star'
const paths: Record<IconName, string> = {
  progress: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z',
  'bookmark-check': 'M6 4h12v17l-6-4-6 4V4Zm3 5 2 2 4-4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  check: 'm5 12 4 4L19 6',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  close: 'm6 6 12 12M6 18 18 6',
  theme: 'M12 3a9 9 0 1 0 0 18V3Zm0 0a9 9 0 0 1 0 18',
  shuffle:
    'M3 6h3c6 0 6 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-1 4-3m4-6c1-2 2-3 4-3h3m-4-4 4 4-4 4',
  chevron: 'm9 5 7 7-7 7',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z',
}
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
