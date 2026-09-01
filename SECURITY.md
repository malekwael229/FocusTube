# Security Policy

FocusTube is intended to run locally in the user's browser. It should not transmit user settings, browsing activity, or extension statistics to external servers.

## Supported Version

Security fixes target the latest stable FocusTube release. Older releases may not receive separate security patches, so users should update to the newest store or GitHub release when a security fix is published.

## Reporting Security or Privacy Issues

For sensitive reports, use [GitHub private vulnerability reporting](https://github.com/malekwael229/FocusTube/security/advisories/new). Reports submitted there are visible only to the reporter and repository maintainers.

For a report that is safe to discuss publicly, open a GitHub Issue with `[Security]` or `[Privacy]` in the title. Do not include exploit details, secrets, or personal data in public issues.

Please include:

- Browser and operating system.
- Extension version.
- Website affected.
- Steps to reproduce.
- Expected behavior.
- Actual behavior.
- Screenshots or screen recordings if helpful.

The maintainer aims to acknowledge private vulnerability reports within 7 days and provide an initial triage or status update within 14 days. Fix and disclosure timing depends on severity, reproducibility, browser-store review timing, and whether coordinated disclosure is needed.

## Coordinated Disclosure

Please give the project a reasonable opportunity to investigate and release a fix before publishing exploit details for an unresolved vulnerability. Confirmed vulnerabilities will be documented through an appropriate GitHub security advisory, release note, or public issue when disclosure is safe.

## Scope

Relevant reports include:

- Unexpected network requests.
- Data collection or storage that is not documented.
- Permission misuse.
- Cross-site scripting or unsafe DOM injection in extension pages.
- Bugs that expose user settings or browsing behavior.

The project should remain privacy-first: no analytics, no telemetry, no remote configuration, and no unnecessary permissions.
