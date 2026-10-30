import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  block?: boolean
  icon?: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-brand text-on-brand',
  secondary: 'bg-surface-1 text-ink border-line',
  ghost: 'border-transparent bg-transparent text-brand-ink',
}

/** Button look for elements that aren't buttons, such as links. */
export function buttonClasses(variant: ButtonVariant = 'primary', block = false): string {
  return cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4',
    'font-body text-body-strong font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none',
    'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-faint',
    '[&_svg]:size-5',
    variants[variant],
    block && 'w-full',
  )
}

export function Button({
  variant = 'primary',
  block = false,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClasses(variant, block), className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}
