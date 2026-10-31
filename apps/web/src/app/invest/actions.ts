'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import {
  createInvestmentAccount,
  deleteInvestmentAccount,
  removeHolding,
  saveHolding,
  updateInvestmentAccount,
  type HoldingInput,
  type InvestmentAccountInput,
} from '@/server/invest'
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
