'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import {
  createLoan,
  createProperty,
  deleteLoan,
  deleteProperty,
  setLoanBalance,
  setPaymentExample,
  setRentExample,
  updateLoan,
  updateProperty,
  type LoanInput,
  type PropertyInput,
} from '@/server/loans'
import { requireSession } from '@/server/session'

/** Everything that shows property, loans or the spending they feed. */
const PATHS = ['/invest', '/', '/transactions']

export async function createPropertyAction(input: PropertyInput) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    const row = await createProperty(requireDb(), member, input)
    return { id: row.id }
  })
}

export async function updatePropertyAction(id: string, input: PropertyInput) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/property/${id}`], async () => {
    await updateProperty(requireDb(), member, id, input)
    return {}
  })
}

export async function deletePropertyAction(id: string) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    await deleteProperty(requireDb(), member, id)
    return {}
  })
}

export async function setRentExampleAction(id: string, transactionId: string | null) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/property/${id}`], async () => {
    const changed = await setRentExample(requireDb(), member, id, transactionId)
    return { changed }
  })
}

export async function createLoanAction(input: LoanInput) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    const row = await createLoan(requireDb(), member, input)
    return { id: row.id }
  })
}

export async function updateLoanAction(id: string, input: LoanInput) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/loan/${id}`], async () => {
    await updateLoan(requireDb(), member, id, input)
    return {}
  })
}

export async function deleteLoanAction(id: string) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    await deleteLoan(requireDb(), member, id)
    return {}
  })
}

export async function setLoanBalanceAction(id: string, input: { balance: string; on: string }) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/loan/${id}`], async () => {
    await setLoanBalance(requireDb(), member, id, input)
    return {}
  })
}

export async function setPaymentExampleAction(id: string, transactionId: string | null) {
  const { member } = await requireSession()
  return runAction([...PATHS, `/invest/loan/${id}`], async () => {
    const changed = await setPaymentExample(requireDb(), member, id, transactionId)
    return { changed }
  })
}
