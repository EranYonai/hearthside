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
- Invest tab: investment accounts per member, holdings added by hand, portfolio value and
  allocation (#25, #28, #31).
- Investments in each member's currency with daily exchange rates, delayed market prices, and
  holdings import from Excel or CSV (#29, #30, #28).
- Investment accounts also appear on the Accounts tab, with their value.
- Investment trends: value against money put in, time-weighted returns, and deposits, fees
  and income per year. Money in and out is recorded per account (#32).
- Market-style value charts on the Invest tab, each investment account and Trends, filled in
  from past prices before values were recorded.
- Fields no longer zoom phones in, so pages keep their width after moving between them.
- The Import page also imports investment holdings into a chosen account.
- A page per holding: position, share of the portfolio, price history from 1M to 5Y, and fund
  facts (yearly fee, index, domicile, document links) kept by the household (#33).
- A passive-investing check-up: target split (80/20 by default, set by the household), fees,
  home bias, emergency fund and steady deposits. Gentle notes only; it can be turned off (#34).
- Monthly payments that settle another account's statement are matched to that statement by
  amount and date (or by name), so combined totals count the spending once. The match keeps
  the statement's total, and rows show when the two disagree.
- Account looks: each account shows a color and a short badge for where it comes from, and
  you can pick its source and your own color when editing it. Transactions show a matching dot.
- Delete an account, with its imports and transactions, from its edit page (asks first).

### Security

- People who join with an invite link wait for the owner's approval before they can see
  anything. The owner approves or declines them in Settings, under Members. Existing members
  are approved automatically on upgrade.
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
