import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  text?: string | null
  className?: string
  as?: 'strong' | 'span' | 'small'
}

export function MarqueeText({ text, className = '', as: Tag = 'span' }: Props) {
  const value = String(text || '—')
  const viewportRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLSpanElement | null>(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    const measure = () => setOverflow(Math.max(0, track.scrollWidth - viewport.clientWidth))
    const frame = requestAnimationFrame(measure)
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(frame)
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(track)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [value])

  const rtl = /[\u0600-\u06FF]/.test(value)
  const style = overflow > 2 ? ({
    '--marquee-shift': `${rtl ? overflow : -overflow}px`,
    '--marquee-duration': `${Math.max(8, Math.min(22, 7 + overflow / 18))}s`,
  } as CSSProperties) : undefined

  return <Tag
    ref={viewportRef as never}
    dir="auto"
    title={value}
    tabIndex={overflow > 2 ? 0 : undefined}
    className={`marquee-text ${overflow > 2 ? 'is-overflowing' : ''} ${className}`.trim()}
  ><span ref={trackRef} className="marquee-text__track" style={style}>{value}</span></Tag>
}
