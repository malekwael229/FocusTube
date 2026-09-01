# Validation and Security Readiness

This file tracks evidence and remaining work for external validation. It is not a certification claim.

Last reviewed: September 1, 2026.

## Repository Evidence

- Public MIT-licensed source with tagged releases.
- `README.md` covers installation, supported sites, privacy, and project impact.
- `CONTRIBUTING.md`, `TESTING.md`, `ARCHITECTURE.md`, and `SECURITY.md` document contribution, testing, architecture, and security practices.
- CI runs the full test suite on pushes and pull requests.
- Release packages are built from an allowlist and checked for reproducibility.
- Extension pages use a self-only CSP and do not load remote code.
- Runtime permissions are limited to storage, alarms, notifications, and supported sites.

## OpenSSF

### OSPS Baseline Level 1

Known gaps or settings to verify before claiming Level 1:

- Protect `main` against direct commits, force pushes, and deletion.
- Confirm secret scanning and push protection, or document the equivalent preventive control.
- Re-check workflow permissions whenever CI changes.

Repository evidence already covers licensing, public history, contribution guidance, defect reporting, dependency metadata, private security reporting, and CI least privilege.

### Best Practices Passing

Before submitting the questionnaire:

- Decide whether to add a minimal JavaScript linter or document another valid warning mechanism.
- Confirm CodeQL is running successfully on the default branch.
- Answer human-attestation items, such as secure-design knowledge, personally and accurately.
- Explain the dev-only `web-ext` / `addons-linter` advisories documented in `TESTING.md`; they are not extension runtime dependencies.
- Do not claim fuzzing or measured branch/statement coverage unless they are actually implemented.

### Scorecard

The repository runs the official OpenSSF Scorecard workflow. Review the actual findings rather than optimizing only for the numeric score.

Current expected weak spots are branch protection, limited human code-review history on a single-maintainer project, and any unresolved dependency or repository-security findings.

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

1. Protect `main` and verify repository security settings.
2. Review the first OpenSSF Scorecard results.
3. Complete the OpenSSF Best Practices Passing questionnaire with repository evidence.
4. Confirm the current stable release is live in browser stores.
5. Submit the Edge feature request.
6. Submit the Mozilla Recommended nomination.
7. Save dated evidence of store recognition, ratings, user counts, GitHub traction, and independent mentions.
