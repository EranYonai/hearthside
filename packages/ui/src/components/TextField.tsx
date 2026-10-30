import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../cx'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function TextField({ label, hint, className, id, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div className={cx('grid gap-1', className)}>
      <label htmlFor={inputId} className="text-body-strong text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hintId}
        className={cx(
          'min-h-11 rounded-md border border-line bg-surface-2 px-3 text-body text-ink',
          'placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
        {...rest}
      />
      {hint && (
        <span id={hintId} className="text-caption text-ink-muted">
          {hint}
        </span>
      )}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'negative' | 'positive'
  children: ReactNode
}) {
  const tones = {
    info: 'bg-surface-2 text-ink',
    warning: 'bg-warning-soft text-warning',
    negative: 'bg-negative-soft text-negative',
    positive: 'bg-positive-soft text-positive',
  }
  return (
    <p
      role={tone === 'negative' ? 'alert' : 'status'}
      className={cx('rounded-md px-3 py-2 text-body', tones[tone])}
    >
      {children}
    </p>
  )
}
