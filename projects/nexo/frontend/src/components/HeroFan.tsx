import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { mediaLabels, type MediaItem } from '../data/selection'
import { Cover } from './MediaCard'
export function HeroFan({
  items: catalog,
  onDark = false,
}: {
  items: MediaItem[]
  onDark?: boolean
}) {
  const items = catalog.slice(0, 5)
  const [front, setFront] = useState(0)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const order = items.map((_, i) => (i - front + items.length) % items.length)
  const current = items[front % items.length]
  if (!current) return null
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div
        ref={ref}
        className="hero-fan-stage relative h-[22rem] sm:h-[28rem] [perspective:1200px]"
        onPointerMove={(e) => {
          if (e.pointerType === 'touch') return
          const r = ref.current!.getBoundingClientRect()
          if (!r.width || !r.height) return
          setTilt({
            x: Math.max(
              -1,
              Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2),
            ),
            y: Math.max(
              -1,
              Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2),
            ),
          })
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        onPointerCancel={() => setTilt({ x: 0, y: 0 })}
      >
        {items.map((item, i) => {
          const pos = order[i] ?? 0
          const offset = pos === 0 ? 0 : pos <= 2 ? pos : pos - items.length
          return (
            <button
              key={item.id}
              type="button"
              tabIndex={pos === 0 ? -1 : 0}
              aria-label={`Trazer ${item.title} para a frente`}
              onClick={() => setFront(i)}
              className="hero-fan-cover absolute left-1/2 top-1/2 w-40 overflow-hidden rounded-md shadow-cover transition-all duration-250 ease-[cubic-bezier(.16,1,.3,1)] will-change-transform sm:w-52"
              style={{
                zIndex: 10 - Math.abs(offset),
                opacity: Math.abs(offset) > 2 ? 0 : 1,
                transform: `translate(-50%,-50%) translateX(${offset * 38}%) translateY(${Math.abs(offset) * 6}%) rotate(${offset * 6}deg) scale(${1 - Math.abs(offset) * 0.1}) rotateY(${tilt.x * 10}deg) rotateX(${-tilt.y * 8}deg)`,
                filter: offset === 0 ? 'none' : 'saturate(.75) brightness(.85)',
              }}
            >
              <Cover item={item} />
            </button>
          )
        })}
      </div>
      <FrontCaption item={current} onDark={onDark} />
      <div
        className="mt-4 flex justify-center gap-2"
        role="group"
        aria-label="Escolher capa em destaque"
      >
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            aria-label={it.title}
            aria-pressed={i === front}
            onClick={() => setFront(i)}
            className={`h-2.5 w-2.5 rounded-full transition-all aria-pressed:w-8 ${onDark ? 'bg-paper/30 aria-pressed:bg-paper' : 'bg-foreground/20 aria-pressed:bg-primary'}`}
          />
        ))}
      </div>
    </div>
  )
}
function FrontCaption({ item, onDark }: { item: MediaItem; onDark: boolean }) {
  return (
    <p
      key={item.id}
      className="animate-rise mt-2 text-center text-sm"
      aria-live="polite"
    >
      <span className={`eyebrow ${onDark ? 'opacity-70' : 'text-primary'}`}>
        {mediaLabels[item.type]}
      </span>{' '}
      <Link
        to={`/explore?type=${item.type}`}
        className="font-display text-lg italic hover:underline"
      >
        {item.title}
      </Link>
      {item.year && (
        <span className={onDark ? 'opacity-70' : 'text-muted-foreground'}>
          {' '}
          · {item.year}
        </span>
      )}
    </p>
  )
}
export function CoverMarquee({ items }: { items: MediaItem[] }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    if (!viewport.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])
  if (!items.length) return null
  const source = items.slice(0, 15)
  const repeats = Math.max(1, Math.ceil((width / 132 + 2) / source.length))
  const row = Array.from({ length: repeats }, () => source).flat()
  return (
    <div className="cover-marquee" ref={viewport}>
      <div
        className="lv-marquee group relative overflow-hidden py-10 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]"
        aria-hidden="true"
      >
        <div
          className="cover-marquee-track"
          style={
            { '--marquee-duration': `${row.length * 3.5}s` } as CSSProperties
          }
        >
          {[0, 1].map((copy) => (
            <div className="cover-marquee-group" key={copy}>
              {row.map((item, index) => (
                <div
                  key={`${item.id}:${index}`}
                  className="w-28 shrink-0 overflow-hidden rounded-sm shadow-cover transition-transform duration-300 hover:-translate-y-2 hover:rotate-[-2deg] sm:w-32"
                >
                  <Cover item={item} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
