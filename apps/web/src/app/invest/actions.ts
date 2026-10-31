'use server'

import { HoldingsFormatError, ImportFormatError, parseHoldings, readTable } from '@hearthside/core'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  getVisibleInvestmentAccount,
  importHoldings,
  mayManage,
  removeHolding,
  saveHolding,
  updateInvestmentAccount,
  type HoldingInput,
  type InvestmentAccountInput,
} from '@/server/invest'
import { setDisplayCurrency } from '@/server/profile'
import { addMovement, removeMovement, type MovementInput } from '@/server/trends'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

const PATHS = ['/invest']

export async function createInvestmentAccountAction(input: InvestmentAccountInput) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    const account = await createInvestmentAccount(requireDb(), member, input)
    return { id: account.id }
  })
}

export async function updateInvestmentAccountAction(id: string, input: InvestmentAccountInput) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${id}`], async () => {
    await updateInvestmentAccount(requireDb(), member, id, input)
    return {}
  })
}

export async function deleteInvestmentAccountAction(id: string) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    await deleteInvestmentAccount(requireDb(), member, id)
    return {}
  })
}

export async function saveHoldingAction(accountId: string, input: HoldingInput) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${accountId}`], async () => {
    await saveHolding(requireDb(), member, accountId, input)
    return {}
  })
}

export async function removeHoldingAction(accountId: string, holdingId: string) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${accountId}`], async () => {
    await removeHolding(requireDb(), member, holdingId)
    return {}
  })
}

export async function setDisplayCurrencyAction(currency: string) {
  const { member } = await requireSession()
  return runAction([...PATHS, '/settings'], async () => {
    await setDisplayCurrency(requireDb(), member, currency)
    return {}
  })
}

/** Read a holdings file and show what it holds; nothing is saved yet. */
export async function previewHoldingsFileAction(accountId: string, form: FormData) {
  const { member } = await requireSession()
  return runAction([], async () => {
    const account = await getVisibleInvestmentAccount(requireDb(), member, accountId)
    if (!mayManage(member, account))
      throw new AuthError('not_allowed', 'Only the person whose account this is can change it')
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0)
      throw new AuthError('not_allowed', 'Pick a file')
    try {
      const sheets = readTable(new Uint8Array(await file.arrayBuffer()), file.name)
      return parseHoldings(sheets, account.currency)
    } catch (err) {
      if (err instanceof HoldingsFormatError || err instanceof ImportFormatError)
        throw new AuthError('not_allowed', err.message)
      throw err
    }
  })
}

export async function importHoldingsAction(
  accountId: string,
  rows: {
    symbol: string
    name: string
    units: string
    price: string | null
    currency: string | null
    assetClass: string
  }[],
  removeMissing: boolean,
) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${accountId}`], async () =>
    importHoldings(
      requireDb(),
      member,
      accountId,
      rows.map((r) => ({ ...r, price: r.price ?? undefined })),
      { removeMissing: removeMissing === true },
    ),
  )
}

export async function addMovementAction(accountId: string, input: MovementInput) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${accountId}`, '/invest/trends'], async () => {
    await addMovement(requireDb(), member, accountId, input)
    return {}
  })
}

export async function removeMovementAction(accountId: string, id: string) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/${accountId}`, '/invest/trends'], async () => {
    await removeMovement(requireDb(), member, id)
    return {}
  })
}
