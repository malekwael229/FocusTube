# Validation and Security Readiness

This file tracks evidence and remaining work for external validation. It is not a certification claim.

Last reviewed: October 1, 2026.

## Repository Evidence

- Public MIT-licensed source with tagged releases.
- `README.md` covers installation, supported sites, privacy, and project impact.
- `CONTRIBUTING.md`, `TESTING.md`, `ARCHITECTURE.md`, and `SECURITY.md` document contribution, testing, architecture, and security practices.
- CI runs the full test suite on pushes and pull requests.
- Release packages are built from an allowlist and checked for reproducibility.
- Extension pages use a self-only CSP and do not load remote code.
- Runtime permissions are limited to storage, alarms, notifications, and supported sites.
- The 2.5.0 release keeps API permissions and extension-page CSP unchanged; its Reddit host access is limited to `reddit.com` and `www.reddit.com`.
- The full Windows Node 24 gate and Linux Node 20 package-reproducibility check pass; CI runs the full suite on Node 20.
- Fixture checks and manual/live checks are recorded separately: fixtures establish deterministic behavior, while manual reports are limited observations and do not establish a complete browser matrix.
- The 2.4.0 localization work packages eight browser-native catalogs with English as the default. It adds no permissions, CSP allowances, network endpoints, or runtime dependencies, and it leaves storage keys and runtime message identities unchanged.
- As rechecked on October 1, 2026, the production-only and full development dependency audits report zero vulnerabilities. The `web-ext` and `addons-linter` chain uses the fixed `image-size` 2.0.4 release; the tooling is not packaged with the extension.
- On October 1, an issue reporter confirmed Firefox feed blocking, posts, comments, and search in [issue #49](https://github.com/malekwael229/FocusTube/issues/49#issuecomment-5934030951); the browser version and full matrix were not provided.

## Historical 2.4.0 Localization Evidence

- Deterministic localization tests cover catalog keys, placeholders, references, package inclusion, fallback behavior, scoped direction handling, resolved-catalog metadata for supported Arabic and unsupported Japanese/right-to-left browser locales, and stable internal identities using mocked browser i18n responses.
- Native Chromium extension tests exercise Arabic localization and right-to-left layout in the popup, options page, and an extension-owned overlay. They also verify English text with English language/direction metadata on extension pages and an owned overlay for an unsupported Japanese locale profile, while recording the actual browser UI locale separately.
- A screenshot review of the native Arabic Chromium run found the tested surfaces readable with no obvious clipping.
- Supported-site browser smoke tests use local fixtures. Firefox lint validates the staged package but is not a native Firefox runtime test.
- A serial Windows `test:all` gate passed on September 9, 2026 at commit `fa3d7ad`, including package reproducibility, native Chromium Arabic bounded rendering, the unsupported Japanese locale profile's default-English fallback, and Firefox lint with zero errors, notices, or warnings. A pinned ESLint 9.39.5 check also passed at that commit. The September 6 earlier-tree pass remains part of the dated validation history, and the September 9 gate superseded it for the integrated catalog-metadata repair. This is dated 2.4.0 localization evidence, not a current 2.5.0 Firefox runtime claim. It does not establish complete native-speaker, live-site, or cross-browser locale compatibility.

## OpenSSF

### OSPS Baseline Level 1

Settings to keep verified before claiming or renewing Level 1:

- Keep the active `Protect main` ruleset in place: pull requests, up-to-date CI/CodeQL/release checks, and blocks on deletion and force pushes.
- Confirm secret scanning and push protection, or document the equivalent preventive control.
- Re-check workflow permissions whenever CI changes.

Repository evidence already covers licensing, public history, contribution guidance, defect reporting, dependency metadata, private security reporting, and CI least privilege.

### Best Practices Passing

When updating the questionnaire:

- Confirm the existing JavaScript lint step and CodeQL still pass on the default branch.
- Answer human-attestation items, such as secure-design knowledge, personally and accurately.
- Keep the `web-ext` / `addons-linter` audit evidence documented in `TESTING.md`; these are development-only dependencies and are not extension runtime dependencies.
- Do not claim fuzzing or measured branch/statement coverage unless they are actually implemented.

### Scorecard

The repository runs the official OpenSSF Scorecard workflow. Review the actual findings rather than optimizing only for the numeric score.

On October 1, the API showed three open Scorecard findings: Code-Review (alert 6, with no independent human approvals in recent history), Fuzzing (alert 4, with no recognized fuzzing integration), and Branch-Protection (alert 1, with no required approver, code-owner review, stale-review dismissal, or last-push approval). The Vulnerabilities finding was absent from that API result. The project has one active maintainer; do not claim independent human reviews, approvals, or fuzzing coverage unless they actually occur.

## Mozilla Recommended

Before nomination:

- Re-check every Firefox host/API permission against current behavior.
- Run CodeQL and the full CI suite with no unresolved extension-runtime findings.
- Complete a current manual Firefox pass on supported sites.
- Verify the AMO listing matches the shipped version, permissions, features, and privacy statements.
- Keep fixture-based browser tests clearly described as fixtures, not proof of live-site compatibility.

## Microsoft Edge Featured

Before submission:

- Confirm the Edge Add-ons listing matches the current stable release.
- Run the manual Edge browser matrix on supported sites.
- Check that every listing claim matches the shipped package.
- Re-check permission breadth and performance on dynamic pages.

## Release Verification

The release-verification workflow builds Chromium and Firefox packages twice, checks that manifest versions match, compares ZIPs byte-for-byte, and prints SHA-256 hashes. On version tags it also checks that the tag matches the manifest version.

This verifies repository build reproducibility. A browser-store package must still be compared separately if we want to prove it came from a specific commit.

## Next Steps

1. Keep the existing `main` ruleset and repository security settings under review without creating a single-maintainer approval deadlock.
2. Recheck the three remaining OpenSSF Scorecard findings when the review process or test coverage changes.
3. Complete the OpenSSF Best Practices Passing questionnaire with repository evidence.
4. Confirm each browser-store listing matches the intended stable release. GitHub publication alone does not establish store availability.
5. Submit the Edge feature request.
6. Submit the Mozilla Recommended nomination.
7. Save dated evidence of store recognition, ratings, user counts, GitHub traction, and independent mentions.
