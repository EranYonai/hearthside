import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Bus,
  Fuel,
  HeartPulse,
  House,
  Landmark,
  PiggyBank,
  Plane,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cx } from '../cx'

export const CATEGORY_ICONS = {
  groceries: ShoppingCart,
  'eating-out': Utensils,
  home: House,
  bills: Zap,
  car: Fuel,
  transport: Bus,
  kids: Baby,
  health: HeartPulse,
  shopping: ShoppingBag,
  subscriptions: Repeat,
  travel: Plane,
  income: Banknote,
  savings: PiggyBank,
  transfer: ArrowLeftRight,
  pension: Landmark,
  other: Tag,
} satisfies Record<string, LucideIcon>

export type Category = keyof typeof CATEGORY_ICONS

export interface CategoryIconProps {
  category: Category
  active?: boolean
  label?: string
  className?: string
}

export function CategoryIcon({ category, active = false, label, className }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-category={category}
      className={cx(
        'inline-grid size-9 flex-none place-items-center rounded-pill',
        active ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-muted',
        className,
      )}
    >
      <Icon size={20} strokeWidth={2} aria-hidden />
    </span>
  )
}
