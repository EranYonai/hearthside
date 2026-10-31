export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL) return
  const { runMigrations } = await import('./server/migrate')
  await runMigrations()
  // Catch up on entries waiting for the categorizer, without holding up startup.
  const [{ sweepPending }, { requireDb }] = await Promise.all([
    import('./server/categorize'),
    import('./lib/db'),
  ])
  void sweepPending(requireDb()).catch(() => undefined)
  // A value per investment account per day, for trends.
  const { startSnapshots } = await import('./server/trends')
  startSnapshots(requireDb())
}
