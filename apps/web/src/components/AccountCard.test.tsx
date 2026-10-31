import { BRANDS } from '@hearthside/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountCard, AccountMark } from './AccountCard'

describe('AccountCard', () => {
  it('paints a card in its provider color with the provider monogram', () => {
    render(<AccountCard name="Cal ·1234" kind="card" provider="cal" last4="1234" />)
    const card = screen.getByTestId('account-card')
    expect(card.dataset.brand).toBe(BRANDS.cal.color)
    expect(card.getAttribute('style')).toContain('linear-gradient')
    expect(screen.getByTestId('account-mark').textContent).toBe('cal')
    expect(screen.getByText('Cal')).toBeTruthy()
    expect(screen.getByLabelText('ending 1234')).toBeTruthy()
  })

  it('lets the person’s own color win', () => {
    render(<AccountCard name="Mine" kind="card" provider="cal" color="#5b2c83" />)
    expect(screen.getByTestId('account-card').dataset.brand).toBe('#5B2C83')
  })

  it('gives bank accounts a stripe instead of a painted face', () => {
    render(<AccountCard name="Home" kind="bank" provider="leumi" />)
    const card = screen.getByTestId('account-card')
    expect(card.getAttribute('style')).toBeNull()
    expect(card.dataset.brand).toBe(BRANDS.leumi.color)
    expect(screen.getByTestId('account-mark').getAttribute('style')).toContain('background')
  })

  it('stays neutral with initials when nothing is known', () => {
    render(<AccountMark name="Joint savings" />)
    const mark = screen.getByTestId('account-mark')
    expect(mark.textContent).toBe('JS')
    expect(mark.getAttribute('style')).toBeNull()
  })
})
