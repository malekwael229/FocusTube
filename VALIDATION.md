# Validation and Security Readiness

This document is an evidence checklist for external validation work. It is intentionally conservative: a criterion is not treated as satisfied just because it is likely true. External service settings, store dashboards, and human-attestation requirements must be verified separately.

Last reviewed: September 1, 2026.

## Current Repository Evidence

- Public source repository with MIT license and tagged releases.
- `README.md` describes the product, installation paths, supported surfaces, privacy model, and dated project impact.
- `CONTRIBUTING.md` documents local setup, pull-request expectations, testing, privacy constraints, and the policy that major functionality adds or updates automated tests.
- `TESTING.md` documents the automated suites, manual browser matrix, fixture limitations, package reproducibility checks, and known dev-only dependency advisories.
- `ARCHITECTURE.md` documents browser manifests, privileged background behavior, content-script boundaries, storage, messaging, and the privacy boundary.
- `SECURITY.md` provides private vulnerability reporting, scope, coordinated disclosure guidance, supported-version guidance, and response targets.
- CI runs the complete test suite on pushes and pull requests.
- Release packaging is allowlisted and reproducibility-tested.
- Extension manifests use a self-only extension-page CSP and do not declare remote code.
- Runtime permissions are limited to storage, alarms, notifications, and the five supported site families.

## OSPS Baseline Level 1 Pre-Audit

The authoritative checklist is the OpenSSF OSPS Baseline. This section records repository evidence and known gaps, not a certification claim.

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Primary-branch direct commits | **Gap** | `main` is currently not protected. Enable a GitHub repository ruleset or branch protection that blocks direct commits to `main`. |
| Primary-branch deletion | Verify setting | Confirm the repository ruleset prevents or explicitly gates deletion of `main`. |
| Least-privilege CI | Good evidence | Existing CI uses `contents: read`; new security workflows declare only the write permissions they need. |
| Untrusted CI metadata | Good evidence | Workflows do not interpolate issue/PR text or other untrusted metadata into shell commands. Re-check whenever workflows change. |
| Secrets and credentials | Needs platform verification | No intended credentials belong in the repository. Confirm GitHub secret scanning/push protection status separately. |
| User documentation | Good evidence | `README.md`, store notes, and extension UI documentation cover normal use. |
| Defect reporting | Good evidence | GitHub Issues, issue forms, `CONTRIBUTING.md`, and `SECURITY.md`. |
| Public change discussion | Good evidence | GitHub Issues and pull requests are enabled. |
| Contribution process | Good evidence | `CONTRIBUTING.md` and PR template. |
| Open-source licensing | Good evidence | MIT `LICENSE` is in the repository and tagged source releases. |
| Public source/history | Good evidence | GitHub repository and commit history are public. |
| Direct dependency list | Good evidence | `package.json` and `package-lock.json`. Dependencies are development/test tooling, not extension runtime dependencies. |
| Generated executables in VCS | Good evidence | Release/test ZIPs and generated build directories are ignored and are not tracked in the source tree. |
| Security contact/private reporting | Good evidence | `SECURITY.md` and GitHub private vulnerability reporting link. |

**Baseline-1 blocker:** do not claim Level 1 compliance until direct commits to `main` are technically prevented and the remaining platform-setting items are verified.

## OpenSSF Best Practices Passing Pre-Audit

The Best Practices badge is a self-certification questionnaire. The following items have strong repository evidence:

- Clear project description and stable public project URL.
- Public instructions to obtain/use the extension, report bugs, and contribute.
- Public version-control repository and change history.
- OSI-approved MIT license.
- HTTPS-hosted project, repository, stores, and release pages.
- Searchable public issue and pull-request discussion.
- Public automated tests with a standard `npm run test:all` entry point.
- CI that runs tests on shared-repository changes.
- Written policy requiring tests for major new functionality, with recent test additions visible in v2.3.1.
- Public security reporting process and private vulnerability-reporting path.
- Reused components are tracked through npm lockfiles and can be updated through standard package tooling.
- Release history is versioned and documented in `CHANGELOG.md` and GitHub Releases.

Items that still require work or human confirmation before submitting a Passing claim:

1. **Code-quality warnings/linting:** the project has syntax and regression checks but no dedicated JavaScript linter configured. The Passing criteria require a warning/safe-language/linter mechanism when one is available. Evaluate adding a minimal ESLint setup or provide another valid mechanism.
2. **Static analysis:** CodeQL is being added in this hardening branch. Treat this as met only after the workflow is merged and produces a successful analysis result.
3. **Secure-design knowledge:** this is a human-attestation criterion. The maintainer must honestly confirm understanding of the secure-design principles listed by the Best Practices program; repository automation cannot answer it.
4. **Known vulnerability handling:** `TESTING.md` records dev-only advisories in the `web-ext`/`addons-linter` chain. The badge answers should explain why they are not packaged in FocusTube and document monitoring/remediation rather than pretending they do not exist.
5. **Credential-leak prevention:** confirm GitHub secret scanning/push protection or another preventive mechanism before making a strong claim.
6. **Dynamic-analysis suggestions and coverage suggestions:** document the current Playwright/browser tests accurately; do not claim fuzzing or measured statement/branch coverage unless actually implemented.

## OpenSSF Scorecard Readiness

This branch adds the official OpenSSF Scorecard GitHub Action with published results. Expected strengths include public source, maintained dependency metadata, CI, security policy, and pinned workflow actions.

Expected score reducers until addressed:

- Unprotected `main` branch.
- Limited historical use of pull-request review because this is primarily a single-maintainer project.
- Any dependency advisories or GitHub security settings that remain disabled.

Do not optimize the repository for the numeric Scorecard result at the expense of honest project practices.

## Mozilla Recommended Readiness

Strong evidence:

- Source is public and actively maintained.
- Firefox manifest declares only `storage`, `alarms`, `notifications`, and supported-site access.
- Extension-page CSP permits scripts from `self` only.
- No project-controlled backend, telemetry, analytics, remote configuration, or remote code is documented or expected.
- Settings, timer state, and statistics remain in browser-local storage.
- Regression tests explicitly reject `innerHTML` assignment in major extension scripts.
- Firefox packaging/linting is part of the automated test gate.
- Security and privacy reporting are documented.

Review before nomination:

- Re-check every host permission against current functionality and remove any permission that is no longer needed.
- Re-run CodeQL and the complete CI suite with no unresolved extension-runtime findings.
- Complete a current manual Firefox test pass on supported sites and record limitations honestly.
- Verify the Firefox Add-ons listing matches the current feature set, permissions, privacy statements, and release version.
- Do not describe fixture-based browser tests as proof of current production-site compatibility.

## Microsoft Edge Featured Readiness

Strong evidence:

- Chromium Manifest V3 build.
- Local-only design with no telemetry/backend/remote code.
- Narrow API permissions and explicit supported-site host permissions.
- Reproducible packaging and public CI.
- Public privacy, testing, architecture, contribution, and security documentation.

Review before feature submission:

- Confirm the Edge Add-ons listing is on the same current release as the repository/store package.
- Re-run the manual Edge browser matrix on all supported sites.
- Confirm every listing claim is directly supported by the shipped Edge package.
- Re-check permission breadth and performance behavior on dynamic sites.

## Release Verification

The release-verification workflow builds Chromium and Firefox packages twice, checks matching manifest versions, compares ZIPs byte-for-byte, and prints SHA-256 hashes. On version tags it also verifies that the tag version matches the browser manifests.

This proves reproducibility of the repository packaging process. It does not prove that a browser-store package was built from a particular commit unless the submitted store artifact is separately compared to the generated artifact.

## External Validation Order

After this hardening work is merged and green:

1. Enable branch protection/repository rules for `main` and verify secret/dependency security settings.
2. Let OpenSSF Scorecard run and review the actual findings.
3. Complete the OpenSSF Best Practices Passing questionnaire using evidence links from this repository; do not self-award criteria that remain uncertain.
4. Confirm v2.3.1 or the current stable release is live on browser stores.
5. Submit the Edge feature request.
6. Submit the Mozilla Recommended nomination.
7. Preserve dated evidence of store recognition, ratings, user counts, GitHub traction, and independent community listings for future application materials.
