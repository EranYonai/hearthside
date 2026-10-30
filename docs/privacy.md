# Privacy principles

Hearthside holds private household data, so it is built to keep that data close.

- **Self-hosted.** Data stays on the instance you run. There is no central service.
- **Least exposure.** Only the web app is reachable, and it binds to loopback by default.
- **Private data is encrypted at rest.** Household data is stored encrypted in the app
  database, never in plain text.
- **No private data in source code or GitHub, ever.** Not in code, tests, fixtures, docs,
  issues, PRs, commits or logs.
- **No real data in the repo.** Tests and fixtures use synthetic data only. Never commit real
  exports, screenshots of real data, or secrets.
- **Data is read at runtime only.** Files you load are processed by your own instance.
- **Roles limit access.** Viewers can't change anything, and members only see what their role
  allows.
- **Backups are encrypted** before they leave the machine, and the key is kept offline.
- **Keep public text vague.** Issues, PRs and commits describe features generally and never
  include personal details or deployment specifics.

## Code review checklist

Every PR review checks that:

- [ ] No real personal or household data appears anywhere in the diff, including tests,
      fixtures, snapshots, screenshots and comments.
- [ ] No secrets, keys or deployment details are committed.
- [ ] New stored fields that hold private data are encrypted in the database.
- [ ] Logs and error messages don't print private data.
- [ ] PR title, description and commits stay generic.

Report security issues privately rather than in a public issue.
