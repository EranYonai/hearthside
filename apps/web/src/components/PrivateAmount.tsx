import { Amount, type AmountProps } from '@hearthside/ui'

/** Stars for a hidden amount: two fewer than its whole digits, at least one. */
export function maskFor(minor: number): string {
  const digits = String(Math.trunc(Math.abs(minor) / 100)).length
  return '*'.repeat(Math.max(1, digits - 2))
}

/** An amount that turns into stars while "Hide numbers" is on. */
export function PrivateAmount({
  wrapClassName,
  ...props
}: AmountProps & { wrapClassName?: string }) {
  return (
    <span data-private data-mask={maskFor(props.minor)} className={wrapClassName}>
      <Amount {...props} />
    </span>
  )
}
