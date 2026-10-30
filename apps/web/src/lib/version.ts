export interface AppVersion {
  version: string
  commit: string
}

/**
 * Baked in at build time by next.config.ts from package.json and GIT_SHA. The
 * process.env reads must stay literal so Next.js can inline them.
 */
export function appVersion(
  baked: { version?: string; commit?: string } = {
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    commit: process.env.NEXT_PUBLIC_GIT_SHA,
  },
): AppVersion {
  return { version: baked.version || '0.0.0', commit: baked.commit || 'dev' }
}

export function versionLabel({ version, commit }: AppVersion): string {
  return `v${version} · ${commit}`
}
