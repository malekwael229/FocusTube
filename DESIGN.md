# Design

## Source of truth

**Status:** Active
**Date:** September 2, 2026
**Product surfaces:** FocusTube GitHub Pages website, including the homepage and five platform-specific information pages.

Evidence reviewed:

- The real extension popup and options markup in `popup.html` and `options.html`.
- Extension behavior and feature names in `README.md`, `STORE_LISTING_NOTES.md`, and the platform content scripts.
- FocusTube colors and controls in `styles.css`.
- Existing store assets in the `focustube-promo-tile` project, especially the real UI and YouTube before/after images.
- GitHub Pages project-site guidance, Google Search documentation for titles, descriptions, canonical URLs, and sitemaps, and WCAG 2.2 guidance for visible focus and reduced motion.

## Brand

FocusTube should feel focused, direct, technical, and trustworthy. The extension is a small practical tool that removes specific distractions without pretending social platforms are unusable.

Trust signals:

- Real extension screenshots and accurate feature descriptions.
- Clear local-first privacy language.
- Open-source code, MIT license, and repository security badges.
- Direct links to official browser stores.

Avoid:

- Generic productivity claims, corporate filler, and invented proof.
- Decorative blobs, fake glass surfaces, stock illustrations, and excessive gradients.
- Fake browser chrome, fake testimonials, and dashboard-style UI that does not exist in the extension.
- Repeating the same card layout for every section.

## Product goals

Goals:

- Explain FocusTube clearly enough that a visitor can decide whether to install it within the first screen.
- Make the real extension the primary visual evidence.
- Give each supported platform a useful search landing page with specific, non-duplicated content.
- Convert direct and search visitors to the correct Chrome, Firefox, or Edge listing.
- Keep the site fast, static, private, and easy to maintain.

Non-goals:

- Replacing the repository documentation.
- Adding accounts, analytics, tracking, personalization, or a backend.
- Reproducing the extension UI as an interactive demo.
- Publishing unverified impact numbers or store claims.

Success signals:

- Store links are prominent and correct.
- Visitors can understand what remains available after blocking.
- All pages work under the `/FocusTube/` GitHub Pages project path.
- The site remains readable and usable at narrow mobile widths and with keyboard navigation.

## Personas and jobs

Primary visitors are students, developers, researchers, remote workers, and other people who still need useful parts of social platforms.

Their jobs:

- Confirm whether FocusTube handles a specific distracting surface.
- Understand the difference between Strict, Warn, and Passive modes.
- Check privacy before granting site access.
- Install from their preferred browser store.
- Inspect the source or project security practices.

## Information architecture

Routes:

- `/FocusTube/` for the product overview, screenshots, modes, privacy, open source, and install links.
- `/FocusTube/block-youtube-shorts/` for Shorts paths, navigation, shelves, and the Subscriptions-page shelf limitation.
- `/FocusTube/instagram-reels-blocker/` for Reels, Explore, Reels navigation, and Stories controls.
- `/FocusTube/tiktok-blocker/` for TikTok feed and video routes plus allowed utility areas.
- `/FocusTube/facebook-reels-blocker/` for Reels paths and targeted Reels, Stories, and People You Might Know hiding.
- `/FocusTube/linkedin-feed-blocker/` for the main feed and Add to your feed card.

Homepage hierarchy:

1. Header with brand, in-page navigation, GitHub, and install action.
2. Hero with exact product category, primary message, store actions, and real UI image.
3. Core idea contrasting whole-site blocking with targeted blocking.
4. Supported-platform links.
5. Strict, Warn, and Passive modes.
6. YouTube before/after image.
7. Secondary focus tools.
8. Prominent privacy statement.
9. Open-source trust signals.
10. Final install section and footer.

## Design principles

1. Show proof before promises. Use the product UI and specific behavior instead of broad claims.
2. Keep useful content visible. The layout should reinforce FocusTube's targeted-blocking idea through clear before/after comparisons and plain explanations.
3. Use contrast for hierarchy, not decoration. Bright cyan is reserved for identity, links, focus, and primary actions.
4. Vary composition by purpose. Use editorial text bands, a platform index, a mode sequence, and wide image sections instead of a wall of repeated cards.
5. Be honest about limits. Platform pages should state what is blocked, what stays available, and selector or language limitations where relevant.

## Visual language

Color:

- Page background: `#071322`.
- Alternate section: `#0b1a2a`.
- Raised surface: `#111d2f`.
- Extension surface: `#2c2c2e` where the real UI appears.
- Primary text: `#f7fbff`.
- Secondary text: `#aeb9c6`.
- Accent: `#4facfe` with `#00d9e8` used sparingly for brand emphasis.
- Strict: `#ef5b62`; Warn: `#f5a524`; Passive: `#4facfe`.

Typography:

- Use a local system sans-serif stack. No remote font requests.
- Headlines are compact and confident, with normal letter spacing.
- Body text uses comfortable line height and a maximum reading width near 68 characters.
- Labels are sentence case except for the FocusTube name and browser/store names.

Spacing and shape:

- Base spacing unit: 8px.
- Content width: about 1180px with responsive side padding.
- Cards and framed media use 8px corner radii.
- Buttons use restrained 6px to 8px radii, not pill shapes except for small mode labels.
- Shadows are limited to the hero product image and small elevated controls.

Motion:

- No automatic animation.
- Short color and transform transitions are allowed for hover and focus.
- All transitions are disabled when `prefers-reduced-motion: reduce` is active.

Imagery and icons:

- Use the existing FocusTube icon and existing promotional screenshots.
- Keep screenshot crops wide enough to show the actual popup/options relationship.
- Use simple text or CSS markers for platform sections. Do not introduce a separate icon library.

## Components

- `site-header`: brand link, compact navigation, GitHub link, and primary install action.
- `store-actions`: Chrome primary action with Firefox and Edge alternatives.
- `hero-media`: framed real UI screenshot with descriptive alt text.
- `platform-index`: five platform links with short, factual summaries.
- `mode-sequence`: Strict, Warn, and Passive shown as three ordered behaviors.
- `before-after-media`: existing YouTube comparison image with caption.
- `privacy-band`: high-contrast statement with five concrete privacy facts.
- `trust-row`: MIT, GitHub, OpenSSF Passing, and Baseline Level 1 links with restrained explanations.
- `site-footer`: GitHub, privacy anchor, license, and all store links.
- `topic-page`: breadcrumb, problem statement, behavior table, mode notes, related pages, and install action.

Component styling and tokens live in `site/styles.css`.

## Accessibility

Target WCAG 2.2 AA where practical.

- Use semantic landmarks, one clear `h1`, ordered heading levels, lists, tables only for tabular behavior, and meaningful image alt text.
- Include a skip link and a visible `:focus-visible` outline with strong contrast.
- Keep all navigation and actions keyboard accessible without JavaScript.
- Maintain at least 44px touch targets for primary interactive controls on mobile.
- Do not communicate mode only through color; always include the mode name.
- Respect reduced-motion preferences and avoid autoplaying media.
- Keep text contrast strong on every surface.

## Responsive behavior

- Wide desktop: two-column hero with copy and screenshot, followed by full-width editorial sections.
- Tablet: hero columns remain balanced until the screenshot becomes cramped, then stack.
- Mobile: single-column flow, wrapping navigation, full-width primary store action, horizontally safe media, and no fixed-width controls.
- Images use intrinsic dimensions and `height: auto`; no section may create horizontal overflow at 320px.
- Hover treatments must not be required to discover information.

## Interaction states

- Default, hover, active, and visible keyboard-focus states are required for all links and buttons.
- External store and trust links remain normal links and do not open scripted overlays.
- The site has no loading, account, form, or saved state.
- If images fail, surrounding headings, copy, captions, and alt text still explain the product.
- The site remains fully usable with CSS disabled and JavaScript unavailable.

## Content voice

- Short, normal, and specific.
- Lead with the distracting surface and the exact FocusTube behavior.
- Use "block" for routes/interstitials and "hide" for navigation or feed elements.
- Use "Passive" for the extension's allow mode in public copy.
- Avoid inflated productivity language and unsupported comparisons.
- Mention limitations close to the affected behavior.

## Implementation constraints

- Plain HTML and CSS. JavaScript is optional and should be omitted unless it solves a real accessibility or navigation need.
- No framework, build step, package change, remote code, analytics, tracking, cookies, or backend.
- Root `index.html` is the GitHub Pages entry. Topic pages use directory `index.html` files.
- Use repository-relative links for assets and navigation so the project path remains intact.
- Use absolute HTTPS URLs for canonical and Open Graph page URLs.
- Include unique titles, descriptions, canonicals, Open Graph metadata, `robots.txt`, and `sitemap.xml`.
- Copy only required local image assets into `site/assets/`.
- Website tests must verify internal targets, metadata, store URLs, prohibited tracking/code patterns, and project-path-safe references.
- Browser verification must cover desktop and mobile layouts, keyboard focus, overflow, and image loading.

## Open questions

- [ ] Submit `https://malekwael229.github.io/FocusTube/sitemap.xml` in Google Search Console after the site is merged. **Owner:** maintainer. **Impact:** medium for discovery, none for site function.
- [ ] Revisit screenshot freshness after future extension UI changes. **Owner:** maintainer. **Impact:** low until the UI changes materially.
