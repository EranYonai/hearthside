import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineChart } from './LineChart'

const points = [
  { on: '2026-01-01', values: [100_00] },
  { on: '2026-01-02', values: [200_00] },
  { on: '2026-01-03', values: [300_00] },
]

function chart() {
  render(
    <LineChart
      points={points}
      series={[{ label: 'Value', color: 'positive' }]}
      currency="USD"
      kind="money"
      label="Value over time"
    />,
  )
  const plot = screen.getByTestId('line-chart')
  plot.getBoundingClientRect = () =>
    ({ left: 0, width: 300, top: 0, height: 100, right: 300, bottom: 100 }) as DOMRect
  return plot
}

describe('LineChart', () => {
  it('follows a finger dragged across it, day by day, and hides on lift', () => {
    const plot = chart()
    expect(screen.queryByRole('status')).toBeNull()

    act(() => {
      fireEvent.touchStart(plot, { touches: [{ clientX: 5 }] })
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 Jan 2026')

    act(() => {
      fireEvent.touchMove(plot, { touches: [{ clientX: 150 }] })
    })
    expect(screen.getByRole('status')).toHaveTextContent('2 Jan 2026')

    act(() => {
      fireEvent.touchMove(plot, { touches: [{ clientX: 295 }] })
    })
    expect(screen.getByRole('status')).toHaveTextContent('3 Jan 2026')

    act(() => {
      fireEvent.touchEnd(plot, { touches: [] })
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the drag on the chart instead of scrolling the page', () => {
    const plot = chart()
    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    Object.defineProperty(move, 'touches', { value: [{ clientX: 150 }] })
    act(() => {
      plot.dispatchEvent(move)
    })
    expect(move.defaultPrevented).toBe(true)
  })

  it('follows a mouse on hover', () => {
    const plot = chart()
    fireEvent.pointerMove(plot, { clientX: 150, pointerType: 'mouse' })
    expect(screen.getByRole('status')).toHaveTextContent('2 Jan 2026')
    fireEvent.pointerLeave(plot, { pointerType: 'mouse' })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
