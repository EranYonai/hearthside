import { BRANDS } from '@hearthside/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountCard, AccountMark } from './AccountCard'

describe('AccountCard', () => {
  it('paints a card in its provider color with the provider logo', () => {
    render(<AccountCard name="Cal ·1234" kind="card" provider="cal" last4="1234" />)
    const card = screen.getByTestId('account-card')
    expect(card.dataset.brand).toBe(BRANDS.cal.color)
    expect(card.getAttribute('style')).toContain('linear-gradient')
    expect(screen.getByTestId('account-mark').querySelector('img')).toBeTruthy()
    expect(screen.getByText('Cal').className).toContain('sr-only')
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
    expect(card.querySelector('span[aria-hidden][style]')?.getAttribute('style')).toContain(
      'background',
    )
  })

  it('fills the initials badge with the provider color when there is no logo', () => {
    render(<AccountMark name="Pension" provider="menora" />)
    expect(screen.getByTestId('account-mark').getAttribute('style')).toContain('background')
  })

  it('stays neutral with initials when nothing is known', () => {
    render(<AccountMark name="Joint savings" />)
    const mark = screen.getByTestId('account-mark')
    expect(mark.textContent).toBe('JS')
    expect(mark.getAttribute('style')).toBeNull()
  })
})

describe('logos and networks', () => {
  it('shows the built-in logo instead of the initials', () => {
    render(<AccountMark name="Home" provider="leumi" />)
    const mark = screen.getByTestId('account-mark')
    expect(mark.querySelector('img')?.getAttribute('src')).toBe('/logos/leumi.svg')
    expect(mark.textContent).toBe('')
  })

  it('finds a broker from free text and draws the card network chip', () => {
    render(<AccountMark name="Savings" provider="Interactive Brokers" />)
    expect(screen.getByTestId('account-mark').querySelector('img')?.getAttribute('src')).toBe(
      '/logos/ibkr.svg',
    )
    render(<AccountMark name="Other" provider="Menora pension" />)
    expect(screen.getAllByTestId('account-mark')[1]!.textContent).toBe('Mn')
    render(<AccountCard name="x" kind="card" provider="cal" network="visa" />)
    expect(screen.getByTestId('network-mark').querySelector('img')?.getAttribute('alt')).toBe(
      'VISA',
    )
  })
})
