import { appVersion, versionLabel } from './version'

/** Small version line for the bottom of settings (and the home page until settings exists). */
export function VersionTag() {
  return (
    <p className="text-caption text-ink-faint tabular-nums" data-testid="app-version">
      Hearthside {versionLabel(appVersion())}
    </p>
  )
}
