/** Welcome steps each member walks through once, after their passkey and recovery codes. */

export type Step = 'profile' | 'accounts' | 'investments' | 'invite' | 'done'

export const STEP_TITLE: Record<Step, string> = {
  profile: 'About you',
  accounts: 'Your accounts',
  investments: 'Your investments',
  invite: 'Invite your home',
  done: 'All set',
}

export const DISPLAY_CURRENCIES = [
  { code: 'ILS', label: 'Israeli shekel (₪)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British pound (£)' },
] as const

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]['code']

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return DISPLAY_CURRENCIES.some((c) => c.code === value)
}

/** Viewers only look, so they skip accounts and investments. Only the owner invites. */
export function stepsFor(role: 'owner' | 'adult' | 'viewer'): Step[] {
  if (role === 'viewer') return ['profile', 'done']
  if (role === 'adult') return ['profile', 'accounts', 'investments', 'done']
  return ['profile', 'accounts', 'investments', 'invite', 'done']
}

/** The requested step if this member has it, else the first one. */
export function resolveStep(steps: Step[], requested: unknown): Step {
  return steps.find((s) => s === requested) ?? steps[0]!
}

export function nextStep(steps: Step[], current: Step): Step {
  return steps[Math.min(steps.indexOf(current) + 1, steps.length - 1)]!
}

export function previousStep(steps: Step[], current: Step): Step | undefined {
  const i = steps.indexOf(current)
  return i > 0 ? steps[i - 1] : undefined
}
