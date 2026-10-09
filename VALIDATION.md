# Validation and Security Readiness

This file tracks evidence and remaining work for external validation. It is not a certification claim.

Last security-tooling review: October 9, 2026. Earlier browser-validation evidence below remains dated separately.

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
- On October 9, 2026, the production-only dependency audit reports zero vulnerabilities. The current tooling fixes the `source-map-js` and `shell-quote` advisories, while the full audit still reports the unpatched `node-forge` advisory through `web-ext` → `@devicefarmer/adbkit`. Its vulnerable verification path is Android ADB authentication, outside FocusTube's build/lint commands. No development dependencies are packaged with the extension. See `TESTING.md` for dependency versions and advisory links; the finding remains visible without an ignore rule.
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

The October 9 scan on `main` reports four open findings: Code-Review (alert 6, zero approved changesets among 18 sampled), Vulnerabilities (alert 5, the three newly disclosed tooling advisories), Fuzzing (alert 4, no recognized integration on that scanned tree), and Branch-Protection (alert 1, review-related requirements are incomplete). The earlier October 1 scan had no Vulnerabilities finding; that historical result does not establish the current dependency state.

The tooling update fixes two advisories; `node-forge` has no published patched version and remains an upstream dependency risk. This change also adds bounded `fast-check` property tests to CI, but the Fuzzing finding must be rechecked after these tests reach the default branch. A green Scorecard workflow only establishes that the scan completed.

`Protect main` now dismisses stale approvals and requires review-thread resolution. It still requires pull requests, three up-to-date status checks, and blocks deletion and force pushes, with no bypass actors. Mandatory approval count remains zero. Required approvals, code-owner approval, or last-push approval would require another human and can deadlock this single-maintainer project. Automated review does not satisfy Code-Review; real independent human reviews are needed to improve that finding. Do not fabricate approvals or dismiss these valid limitations to change the score.

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
2. Recheck OpenSSF Scorecard findings when dependency fixes, the review process, or test coverage change; retain unresolved risks and single-maintainer limitations in the record.
3. Complete the OpenSSF Best Practices Passing questionnaire with repository evidence.
4. Confirm each browser-store listing matches the intended stable release. GitHub publication alone does not establish store availability.
5. Submit the Edge feature request.
6. Submit the Mozilla Recommended nomination.
7. Save dated evidence of store recognition, ratings, user counts, GitHub traction, and independent mentions.
