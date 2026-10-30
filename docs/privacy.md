# Privacy principles

Hearthside holds private household data, so it is built to keep that data close.

- **Self-hosted.** Data stays on the instance you run. There is no central service.
- **Least exposure.** Only the web app is reachable, and it binds to loopback by default.
- **No real data in the repo.** Tests and fixtures use synthetic data only. Never commit real
  exports, screenshots of real data, or secrets.
- **Data is read at runtime only.** Files you load are processed by your own instance.
- **Roles limit access.** Viewers can't change anything, and members only see what their role
  allows.
- **Backups are encrypted** before they leave the machine, and the key is kept offline.
- **Keep public text vague.** Issues, PRs and commits describe features generally and never
  include personal details or deployment specifics.

Report security issues privately rather than in a public issue.
