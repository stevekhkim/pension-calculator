import { useEffect, useRef, useState } from 'react'
import type { SourceKey } from './engine/simulate'

export interface ChartDatum {
  age: number
  year: number
  values: Record<SourceKey, number>
}

interface Props {
  data: ChartDatum[]
  series: { key: SourceKey; label: string }[]
  format: (v: number) => string
}

const HEIGHT = 280
const MARGIN = { top: 12, right: 16, bottom: 28, left: 52 }
const GAP = 2
const RADIUS = 4

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  // 4등분했을 때 눈금이 깔끔한 값만 쓴다
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 6, 8, 10]) if (v <= m * pow) return m * pow
  return 10 * pow
}

/** 위쪽 모서리만 둥근 막대 */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function StackedChart({ data, series, format }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const totals = data.map((d) => series.reduce((s, { key }) => s + d.values[key], 0))
  const yMax = niceMax(Math.max(0, ...totals))
  const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH
  const band = data.length ? innerW / data.length : 0
  const barW = Math.max(2, Math.min(24, band - GAP))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax)
  const labelEvery = band * 5 >= 36 ? 5 : 10
  const hovered = hover !== null ? data[hover] : null

  return (
    <div className="chart" ref={wrapRef} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={HEIGHT} role="img" aria-label="나이별 세후 월 수령액 누적 막대 차트">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'chart-baseline' : 'chart-grid'}
            />
            <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = MARGIN.left + band * (i + 0.5)
          const x = cx - barW / 2
          const stack = series.filter(({ key }) => d.values[key] > 0)
          let acc = 0
          return (
            <g key={d.age}>
              {hover === i && (
                <rect x={cx - band / 2} y={MARGIN.top} width={band} height={innerH} className="chart-hover" />
              )}
              {stack.map(({ key }, j) => {
                const bottom = y(acc)
                acc += d.values[key]
                const top = y(acc)
                const isTop = j === stack.length - 1
                // 세그먼트 사이 2px 간격은 위쪽에서 뺀다
                const h = Math.max(1, bottom - top - (isTop ? 0 : GAP))
                const segY = bottom - h
                return isTop ? (
                  <path key={key} d={topRounded(x, segY, barW, h)} className={`series-${key}`} />
                ) : (
                  <rect key={key} x={x} y={segY} width={barW} height={h} className={`series-${key}`} />
                )
              })}
              {d.age % labelEvery === 0 && (
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="chart-tick">
                  {d.age}세
                </text>
              )}
              <rect
                x={cx - band / 2}
                y={MARGIN.top}
                width={band}
                height={innerH + MARGIN.bottom}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              />
            </g>
          )
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(MARGIN.left + band * (hover + 0.5), 96), width - 96) }}
        >
          <div className="chart-tooltip-title">
            {hovered.age}세 · {hovered.year}년
          </div>
          {series
            .filter(({ key }) => hovered.values[key] > 0)
            .map(({ key, label }) => (
              <div key={key} className="chart-tooltip-row">
                <span className={`swatch series-${key}`} />
                <span>{label}</span>
                <span className="num">{format(hovered.values[key])}</span>
              </div>
            ))}
          <div className="chart-tooltip-row chart-tooltip-total">
            <span />
            <span>합계</span>
            <span className="num">{format(totals[hover])}</span>
          </div>
        </div>
      )}
    </div>
  )
}
