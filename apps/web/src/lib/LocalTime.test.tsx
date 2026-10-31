import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LocalTime } from './LocalTime'

describe('LocalTime', () => {
  it('shows the time for today and the day otherwise', () => {
    const now = new Date(2026, 9, 31, 15, 0).toISOString()
    render(<LocalTime iso={new Date(2026, 9, 31, 14, 5).toISOString()} now={now} />)
    expect(screen.getByText('14:05')).toBeInTheDocument()
    render(<LocalTime iso={new Date(2026, 9, 30, 14, 5).toISOString()} now={now} />)
    expect(screen.getByText('30 Oct')).toBeInTheDocument()
  })
})
