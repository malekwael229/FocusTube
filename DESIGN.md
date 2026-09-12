# Design

## Source of truth
Status: Active. Date: 2026-09-12. Surfaces: static GitHub Pages homepage and five platform guide pages. Evidence: current extension adapters and manifests, README, security guidance, the supplied Apple design skill, and local renders at desktop, 390px, and 320px. Downloaded images and HTML references are design inspiration only and are not shipped.

## Brand
FocusTube is calm, direct, privacy-first, and open source. Trust comes from accurate route-level claims, MIT licensing, browser-store links, and visible source/security links. Avoid hype, fabricated metrics, dark patterns, and claims about blocking algorithms.

## Product goals
Explain “block the feed, not the website,” help visitors install quickly, and make platform-specific behavior discoverable. Non-goals: changing extension behavior, collecting analytics, or presenting secondary timer features as the main product. Success signals: clear installation paths, useful search pages, valid metadata, and no overflow on narrow screens.

## Personas and jobs
People seeking relief from Shorts, Reels, or feeds while retaining useful platform pages; open-source users verifying privacy and implementation; maintainers updating store links and metrics.

## Information architecture
Sticky overview navigation leads to the homepage, five `/block-*` guides, and install actions. Each guide uses breadcrumb, behavior summary, mode explanation, privacy/source links, stores, and related guides. Footer links Home, Privacy, and GitHub.

## Design principles
Lead with the product promise; describe detected routes and surfaces precisely; keep install actions visible; use restraint, clear hierarchy, and direct feedback; preserve no-JavaScript usability. Apply the Apple guidance as a visual foundation: purposeful composition, calm materials, optical typography, responsive spacing, visible focus, and reduced motion. There are no gesture-driven interactions, so the site does not add decorative animation or a motion library.

## Visual language
Deep charcoal surfaces, cyan and blue accents, subtle translucent panels, rounded cards, and restrained shadows create a focused material system. The existing extension icon identifies the product; no downloaded reference image is copied or displayed. System sans typography uses optical display sizing, tight tracking for headings, and readable body text. Spacing and colors are owned by `assets/site.css`.

## Components
Shared header/nav, skip link, hero, install-link cards, platform cards, mode cards, trust cards, guide layout, related-link pills, and footer. Components are static HTML patterns styled by `assets/site.css`; no framework or remote assets.

## Accessibility
Target WCAG 2.1 AA practices: semantic landmarks, one H1 per page, descriptive image alternatives, visible `:focus-visible`, skip link, native links, readable contrast, and keyboard-accessible controls. No motion is required.

## Responsive behavior
Desktop uses a single-column hero and guide layout with card grids. At 760px and below navigation scrolls horizontally and store/platform cards become single-column. Verify at 1440px, 390px, and 320px with no document-level horizontal overflow.

## Interaction states
Pages are static and usable offline after assets load. Links provide direct navigation; there are no loading, account, form, or tracking states. Broken external stores remain an operational maintenance concern and are covered by link validation against canonical URLs.

## Content voice
Use concise, factual language: hides, redirects, removes, or leaves available where detected. Name supported platforms and modes exactly as the extension does. Keep privacy claims local-first and state that the extension contains no analytics or telemetry.

## Implementation constraints
Plain HTML/CSS only, project-subpath-safe relative links, no scripts/analytics/dependencies, GitHub Pages-compatible `.nojekyll`, sitemap, and robots file. Website files must not enter extension packages or alter manifests, permissions, CSP, version, or runtime behavior. Validate metadata, links, assets, privacy constraints, lint, and the full test gate.

## Open questions
[ ] Confirm future GitHub Pages custom-domain choice with maintainer; affects canonical URLs and sitemap only.
[ ] Refresh dated store/GitHub metrics when a new repository snapshot is approved; affects trust-card copy only.
