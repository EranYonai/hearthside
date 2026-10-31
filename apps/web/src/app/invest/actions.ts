'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  removeHolding,
  saveFundFacts,
  saveHolding,
  updateInvestmentAccount,
  type HoldingInput,
  type InvestmentAccountInput,
} from '@/server/invest'
import { saveInvestSettings } from '@/server/checkup'
import { setDisplayCurrency } from '@/server/profile'
import { addMovement, removeMovement, type MovementInput } from '@/server/trends'
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

export async function saveFundFactsAction(
  holdingId: string,
  input: {
    fee?: string
    index?: string
    domicile?: string
    documents?: { label: string; url: string }[]
  },
) {
  const { member } = await requireSession()
  return runAction([`/invest/holding/${holdingId}`], async () => {
    await saveFundFacts(requireDb(), member, holdingId, input)
    return {}
  })
}

export async function saveInvestSettingsAction(input: {
  stocksTarget: string
  emergencyMonths: string
  checkupOn: boolean
}) {
  const { member } = await requireSession()
  return runAction([...PATHS, '/invest/checkup'], async () => {
    await saveInvestSettings(requireDb(), member, input)
    return {}
  })
}
