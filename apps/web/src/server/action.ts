import 'server-only'
import { revalidatePath } from 'next/cache'
import { AuthError } from './repo'

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Wrap a server action body: known errors become messages, others are logged. */
export async function runAction<T extends object>(
  paths: string[],
  fn: () => Promise<T>,
): Promise<Result<T>> {
  try {
    const value = await fn()
    for (const p of paths) revalidatePath(p)
    return { ok: true, ...value }
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message }
    console.error(JSON.stringify({ level: 'error', msg: 'action failed', error: String(err) }))
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
