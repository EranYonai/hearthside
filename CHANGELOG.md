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
- Automatic categories: rules, past choices and keywords at import, then a local model for the rest (#42).
- Household categories: add, edit and remove your own in Settings, with an icon and keywords.

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
