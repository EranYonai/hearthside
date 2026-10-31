import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Amount,
  Button,
  buttonClasses,
  Logo,
  Notice,
  TextField,
  CATEGORY_ICONS,
  CategoryIcon,
  DonutChart,
  donutSlices,
  MonthBars,
  SpendingBreakdown,
  SummaryCard,
  SyncStatus,
  TransactionList,
  TransactionRow,
} from '../index'

describe('Button', () => {
  it('renders variants and handles clicks', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="secondary" block onClick={onClick} icon={<svg data-testid="icon" />}>
        Sync now
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Sync now' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.className).toContain('bg-surface-1')
    expect(button.className).toContain('w-full')
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('defaults to primary', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button').className).toContain('bg-brand')
  })
})

describe('Amount', () => {
  it('shows money out in ink with a true minus and a direction label', () => {
    render(<Amount minor={-41230} />)
    const el = screen.getByLabelText('spent 412 shekels 30')
    expect(el).toHaveTextContent('−₪412.30')
    expect(el.className).toContain('text-ink')
  })

  it('colors signed money in as positive', () => {
    render(<Amount minor={1620000} signed whole />)
    const el = screen.getByLabelText('received 16200 shekels')
    expect(el).toHaveTextContent('+₪16,200')
    expect(el.className).toContain('text-positive')
  })

  it('supports hero, problem, muted and original amounts', () => {
    const { rerender } = render(
      <Amount minor={-17820} hero problem original={{ minor: -4800, currency: 'USD' }} />,
    )
    const el = screen.getByLabelText('spent 178 shekels 20')
    expect(el.className).toContain('text-amount-hero')
    expect(el.className).toContain('text-negative')
    expect(el).toHaveTextContent('$48.00')
    rerender(<Amount minor={-100} muted />)
    expect(screen.getByLabelText('spent 1 shekel').className).toContain('text-ink-muted')
  })

  it('becomes a button when selectable', async () => {
    const onSelect = vi.fn()
    render(
      <TransactionRow
        category="other"
        merchant="Shop"
        meta="Uncategorized"
        minor={-100}
        onSelect={onSelect}
        selectLabel="Change category for Shop"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Change category for Shop' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

describe('CategoryIcon', () => {
  it('maps every category to an icon', () => {
    for (const category of Object.keys(CATEGORY_ICONS)) {
      const { container, unmount } = render(
        <CategoryIcon category={category as keyof typeof CATEGORY_ICONS} />,
      )
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('is decorative unless labelled, and supports active', () => {
    render(<CategoryIcon category="groceries" label="Groceries" active />)
    const el = screen.getByRole('img', { name: 'Groceries' })
    expect(el.className).toContain('bg-brand-soft')
  })
})

describe('SyncStatus', () => {
  it.each([
    ['ok', 'Synced'],
    ['syncing', 'Syncing'],
    ['stale', 'Stale'],
    ['blocked', 'Blocked'],
    ['login', 'Check password'],
  ] as const)('pairs %s with a word', (state, word) => {
    render(<SyncStatus state={state} />)
    expect(screen.getByRole('status')).toHaveTextContent(word)
  })

  it('shows detail', () => {
    render(<SyncStatus state="stale" detail="2 days" />)
    expect(screen.getByRole('status')).toHaveTextContent('Stale · 2 days')
  })
})

describe('TransactionRow', () => {
  it('renders merchant, installment, meta and amount', () => {
    render(
      <TransactionList>
        <TransactionRow
          category="shopping"
          merchant="ACE"
          meta="Shopping · Card ·4821 · Sam · 28.10"
          minor={-25000}
          installment={{ n: 3, total: 12 }}
        />
      </TransactionList>,
    )
    expect(screen.getByText('ACE')).toBeInTheDocument()
    expect(screen.getByText('3/12')).toBeInTheDocument()
    expect(screen.getByText('Shopping · Card ·4821 · Sam · 28.10')).toBeInTheDocument()
    expect(screen.getByLabelText('spent 250 shekels')).toBeInTheDocument()
  })

  it('marks pending rows', () => {
    render(
      <TransactionRow category="groceries" merchant="Shop" meta="Groceries" minor={-100} pending />,
    )
    expect(screen.getByText('Pending · Groceries')).toBeInTheDocument()
    expect(screen.getByLabelText('spent 1 shekel').className).toContain('text-ink-muted')
  })
})

describe('SummaryCard', () => {
  const segments = [
    { name: 'Home', minor: 100000, percent: 10 },
    { name: 'Groceries', minor: 300000, percent: 30 },
    { name: 'Kids', minor: 50000, percent: 5 },
    { name: 'Car', minor: 80000, percent: 8 },
    { name: 'Health', minor: 20000, percent: 2 },
  ]

  it('shows the hero amount and a legend capped at four, largest first', async () => {
    const onSeeAll = vi.fn()
    render(
      <SummaryCard
        label="Left this month"
        minor={682000}
        segments={segments}
        onSeeAll={onSeeAll}
      />,
    )
    expect(screen.getByLabelText('received 6820 shekels')).toHaveTextContent('₪6,820')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Groceries')
    await userEvent.click(screen.getByRole('button', { name: 'See all' }))
    expect(onSeeAll).toHaveBeenCalledOnce()
  })

  it('renders without segments', () => {
    render(<SummaryCard label="Net worth" minor={100} />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('Logo', () => {
  it('renders an accessible mark that follows ink', () => {
    render(<Logo size={24} />)
    const svg = screen.getByRole('img', { name: 'Hearthside' })
    expect(svg).toHaveAttribute('width', '24')
    expect(svg.getAttribute('class')).toContain('text-ink')
  })
})

describe('buttonClasses', () => {
  it('styles non-button elements', () => {
    expect(buttonClasses('ghost', true)).toContain('text-brand-ink')
    expect(buttonClasses()).toContain('bg-brand')
  })
})

describe('TextField and Notice', () => {
  it('labels the input and links the hint', () => {
    render(<TextField label="Your name" hint="Shown to your household" defaultValue="Alex" />)
    const input = screen.getByLabelText('Your name')
    expect(input).toHaveValue('Alex')
    expect(input).toHaveAccessibleDescription('Shown to your household')
  })

  it('announces problems as alerts and the rest as status', () => {
    const { rerender } = render(<Notice tone="negative">Failed</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    rerender(<Notice>Saved</Notice>)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })
})

describe('donutSlices', () => {
  const s = (key: string, minor: number) => ({ key, name: key, minor })

  it('sorts largest first, drops empty slices and assigns palette colors', () => {
    const shown = donutSlices([s('a', -100), s('b', -300), s('z', 0)])
    expect(shown.map((x) => [x.key, x.color, x.percent])).toEqual([
      ['b', 'chart-1', 75],
      ['a', 'chart-2', 25],
    ])
  })

  it('folds the tail into one Other slice past the maximum', () => {
    const shown = donutSlices(
      [s('a', 50), s('b', 40), s('c', 30), s('d', 20), s('e', 10), s('f', 10)],
      5,
      'Other categories',
    )
    expect(shown).toHaveLength(5)
    expect(shown.at(-1)).toMatchObject({ key: 'other', name: 'Other categories', minor: 20 })
    expect(shown.at(-1)!.color).toBe('chart-other')
    expect(shown.reduce((n, x) => n + x.percent, 0)).toBeCloseTo(100)
  })

  it('returns nothing when there is nothing to show', () => {
    expect(donutSlices([s('a', 0)])).toEqual([])
  })
})

describe('DonutChart', () => {
  it('draws one ring slice per legend row and links rows', () => {
    const { container } = render(
      <DonutChart
        label="Spending by category"
        center={<span>3 transactions</span>}
        slices={[
          { key: 'groceries', name: 'Groceries', minor: -30000, href: '/t?category=groceries' },
          { key: 'home', name: 'Home', minor: -10000 },
        ]}
      />,
    )
    const figure = screen.getByRole('figure', { name: 'Spending by category' })
    expect(figure).toHaveTextContent('3 transactions')
    expect(container.querySelectorAll('[data-slice]')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Groceries, ₪300, 75%' })).toHaveAttribute(
      'href',
      '/t?category=groceries',
    )
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Home₪10025%')
  })
})

describe('MonthBars', () => {
  it('scales bars to the largest month and marks the current one', () => {
    const { container } = render(
      <MonthBars
        label="Spending by month"
        months={[
          { month: '2026-09', label: 'Sep', minor: -20000, href: '/t?month=2026-09' },
          {
            month: '2026-10',
            label: 'Oct',
            minor: -40000,
            href: '/t?month=2026-10',
            current: true,
          },
        ]}
      />,
    )
    const bars = container.querySelectorAll<HTMLElement>('[data-bar]')
    expect(bars[0]!.style.height).toBe('50%')
    expect(bars[1]!.style.height).toBe('100%')
    expect(screen.getByRole('link', { name: 'Oct: ₪400' })).toHaveAttribute('aria-current', 'date')
  })
})

describe('SpendingBreakdown', () => {
  it('switches between the category donut and the month bars', async () => {
    render(
      <SpendingBreakdown
        slices={[{ key: 'home', name: 'Home', minor: -5000 }]}
        months={[{ month: '2026-10', label: 'Oct', minor: -5000, current: true }]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('figure', { name: 'Spending by category' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Months' }))
    expect(screen.getByRole('figure', { name: 'Spending by month' })).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Spending by category' })).toBeNull()
  })

  it('says so when a month has no spending', () => {
    render(<SpendingBreakdown slices={[]} months={[]} />)
    expect(screen.getByText('No spending this month.')).toBeInTheDocument()
  })
})

describe('SummaryCard groups', () => {
  it('outlines each account and keeps category colors across groups', () => {
    const { container } = render(
      <SummaryCard
        label="Spent in October"
        minor={-60000}
        segments={[
          { name: 'Groceries', minor: 40000, percent: 66.7 },
          { name: 'Home', minor: 20000, percent: 33.3 },
        ]}
        groups={[
          {
            key: 'b',
            name: 'Card B',
            color: null,
            minor: -10000,
            parts: [{ name: 'Home', minor: -10000 }],
          },
          {
            key: 'a',
            name: 'Card A',
            color: '#3e6fb0',
            minor: -50000,
            parts: [
              { name: 'Home', minor: -10000 },
              { name: 'Groceries', minor: -40000 },
            ],
          },
        ]}
      />,
    )
    const groups = container.querySelectorAll<HTMLElement>('[data-group]')
    expect([...groups].map((g) => g.dataset.group)).toEqual(['Card A', 'Card B'])
    expect(groups[0]!.style.outlineColor).toContain('#3e6fb0')
    const inside = groups[0]!.querySelectorAll('span')
    expect(inside[0]!.className).toContain('bg-chart-1')
    expect(inside[1]!.className).toContain('bg-chart-2')
    expect(groups[1]!.querySelector('span')!.className).toContain('bg-chart-2')
    expect(screen.getByRole('list', { name: 'By account' })).toHaveTextContent('Card A₪500')
  })

  it('keeps the plain meter for a single account', () => {
    render(
      <SummaryCard
        label="Spent"
        minor={-100}
        segments={[{ name: 'Home', minor: 100, percent: 100 }]}
        groups={[{ key: 'a', name: 'A', minor: -100, parts: [{ name: 'Home', minor: -100 }] }]}
      />,
    )
    expect(screen.queryByTestId('meter-groups')).toBeNull()
    expect(screen.queryByRole('list', { name: 'By account' })).toBeNull()
  })
})
