# Changelog

All notable changes to Hearthside are listed here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). `pnpm release <patch|minor|major>`
moves the Unreleased notes under the new version.

## [Unreleased]

### Added

- Importing household records and a transactions view (#39).
- Accounts tab grouped by type, separate views per account type, and accounts linked to the
  household member who holds them (#43, #46).
- Welcome steps for each new member, and profile settings with a display currency (#40).
- Invest tab: investment accounts per member, holdings added by hand, portfolio value and
  allocation (#25, #28, #31).
- Investments in each member's currency with daily exchange rates, delayed market prices, and
  holdings import from Excel or CSV (#29, #30, #28).

### Security

- Private fields are encrypted in the database, with key rotation (#44). Existing data is
  encrypted on the first start after upgrading, which needs a new key file (see
  [Self-hosting](docs/self-hosting.md)).

## [0.1.0] - 2026-10-30

### Added

- Passkey sign-in and households of any size, with owner, adult and viewer roles (#38).
- Dependency audit in CI (#36).
- App foundation: pnpm workspace, web app and worker, containers, CI, design tokens and version
  display (#24).
- Project README (#10).
- Logo and icon set (#1).

[Unreleased]: https://github.com/EranYonai/hearthside/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/EranYonai/hearthside/releases/tag/v0.1.0
