import { cx } from '../cx'

export interface LogoProps {
  size?: number
  title?: string
  className?: string
}

/** The Monoline mark. The outline follows `ink`, so one mark serves both themes. */
export function Logo({ size = 48, title = 'Hearthside', className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cx('text-ink', className)}
    >
      <path
        d="M344 112 q-22 -18 -2 -36 q16 -14 4 -32"
        fill="none"
        stroke="#FF8A3D"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M320 186 V138 H366 V222" strokeWidth="24" />
        <path d="M136 250 V396 a24 24 0 0 0 24 24 H352 a24 24 0 0 0 24 -24 V250" strokeWidth="24" />
        <polyline points="96,262 256,138 416,262" strokeWidth="28" />
      </g>
      <g strokeWidth="34" strokeLinecap="round">
        <line x1="190" y1="370" x2="190" y2="340" stroke="#FF8A3D" />
        <line x1="256" y1="370" x2="256" y2="296" stroke="#FFC83D" />
        <line x1="322" y1="370" x2="322" y2="256" stroke="#FF8A3D" />
      </g>
    </svg>
  )
}
