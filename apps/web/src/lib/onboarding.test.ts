import { describe, expect, it } from 'vitest'
import { isDisplayCurrency, nextStep, previousStep, resolveStep, stepsFor } from './onboarding'

describe('welcome steps', () => {
  it('fit each role', () => {
    expect(stepsFor('owner')).toEqual(['profile', 'accounts', 'investments', 'invite', 'done'])
    expect(stepsFor('adult')).toEqual(['profile', 'accounts', 'investments', 'done'])
    expect(stepsFor('viewer')).toEqual(['profile', 'done'])
  })

  it('fall back to the first step for unknown or unavailable ones', () => {
    expect(resolveStep(stepsFor('owner'), 'invite')).toBe('invite')
    expect(resolveStep(stepsFor('viewer'), 'accounts')).toBe('profile')
    expect(resolveStep(stepsFor('adult'), undefined)).toBe('profile')
    expect(resolveStep(stepsFor('adult'), ['done'])).toBe('profile')
  })

  it('move forward and back within bounds', () => {
    const steps = stepsFor('adult')
    expect(nextStep(steps, 'profile')).toBe('accounts')
    expect(nextStep(steps, 'accounts')).toBe('done')
    expect(nextStep(steps, 'done')).toBe('done')
    expect(previousStep(steps, 'accounts')).toBe('profile')
    expect(previousStep(steps, 'profile')).toBeUndefined()
  })

  it('accept only listed display currencies', () => {
    expect(isDisplayCurrency('USD')).toBe(true)
    expect(isDisplayCurrency('usd')).toBe(false)
    expect(isDisplayCurrency('XYZ')).toBe(false)
    expect(isDisplayCurrency(undefined)).toBe(false)
  })
})
