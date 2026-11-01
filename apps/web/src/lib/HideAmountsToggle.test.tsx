import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HideAmountsToggle } from './HideAmountsToggle'
import { HIDE_KEY, readHidden } from './privacy'

describe('HideAmountsToggle', () => {
  it('hides and shows numbers and remembers the choice', async () => {
    localStorage.clear()
    render(<HideAmountsToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide numbers' }))
    expect(document.documentElement.dataset.hideAmounts).toBe('')
    expect(localStorage.getItem(HIDE_KEY)).toBe('1')
    await userEvent.click(screen.getByRole('button', { name: 'Show numbers' }))
    expect(document.documentElement.dataset.hideAmounts).toBeUndefined()
    expect(localStorage.getItem(HIDE_KEY)).toBeNull()
  })

  it('reads as shown when storage throws', () => {
    expect(
      readHidden({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe(false)
  })
})
