type IconName =
  | 'arrow'
  | 'bookmark'
  | 'check'
  | 'search'
  | 'close'
  | 'theme'
  | 'shuffle'
  | 'chevron'
  | 'external'

const paths: Record<IconName, string> = {
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
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
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
