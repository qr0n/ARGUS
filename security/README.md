# Vulnerability watch

Twice a day, a GitHub Action checks what ARGUS runs on against live vulnerability feeds and opens a
GitHub issue (label `vuln-watch`) for anything that affects us, with how to fix it.

| Feed | What it tells us | Checked against |
| --- | --- | --- |
| [OSV.dev](https://osv.dev) | Known vulnerabilities in open-source packages (includes GitHub advisories) | Every package and exact version in `backend/` and `frontend/` lockfiles |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Vulnerabilities being exploited in real attacks right now | Package advisories (escalated to **EXPLOITED**) and the infrastructure in `inventory.json` |
| [Node.js releases](https://nodejs.org/dist/index.json) | Security releases of the runtime | `node.version` in `inventory.json` |

- **One issue per finding.** Packages are grouped (one issue per package version, all its advisories,
  and the version that fixes them). New advisories on an open issue are added as a comment. Closing an
  issue while the vulnerable version is still in a lockfile reopens it.
- **Who gets told:** everyone watching the repository gets GitHub's issue notifications. Optionally,
  add a repository secret `SLACK_WEBHOOK_URL` to post a summary to a Slack channel.
- **Keep `inventory.json` current.** It is the list of everything that is not an npm package: Node.js
  version, server OS, proxy, and the browsers and phones staff use. A component missing from it can't
  be matched.

Run it locally (no issues opened):

```bash
node security/vuln-watch/watch.mjs --dry-run              # summary
node security/vuln-watch/watch.mjs --dry-run --show-bodies # full issue text
```

Dependabot (`.github/dependabot.yml`) opens weekly PRs for dependency updates, so most package
findings arrive with a ready-made fix.

The scheduled run only starts once the workflow is on the default branch (`main`).
