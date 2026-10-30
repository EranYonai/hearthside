import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Amount,
  Button,
  buttonClasses,
  Logo,
  CATEGORY_ICONS,
  CategoryIcon,
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
