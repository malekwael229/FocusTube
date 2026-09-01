# Design

## Source of truth

**Status:** Active  
**Date:** 2026-09-02  
**Product surfaces:** browser-extension popup/options UI, public GitHub Pages landing page, store-facing product presentation.

Evidence reviewed:

- Current extension popup structure and existing product styling.
- README product description, supported platforms, privacy model, and project-impact figures.
- Existing GitHub Pages landing-page files under `docs/`.
- GitHub Pages deployment logs showing the repository root is the active publishing source.
- User screenshot of the live site showing the README rendered as the homepage.

## Brand

FocusTube should feel calm, focused, technical, and trustworthy. It is a practical productivity tool, not a lifestyle brand or a flashy startup landing page.

Trust signals:

- Free and open source.
- No analytics or tracking.
- No account or project-controlled backend.
- Available on Chrome, Firefox, and Edge.
- Real public source, releases, tests, and store listings.

Avoid:

- Generic AI-startup aesthetics.
- Decorative gradients, glow effects, excessive shadows, and card grids used only for visual filler.
- Huge marketing copy that pushes the product below the fold.
- Fake browser chrome, fake live counters, or invented usage statistics.
- Repeating the same claim in multiple sections.

## Product goals

Goals:

- Explain the product in one screen: keep useful parts of social sites, remove distracting feeds.
- Make the Chrome install action obvious while keeping Firefox and Edge easy to find.
- Show enough of the extension UI to make the product feel real.
- Establish privacy and open-source trust quickly.
- Work well on desktop and mobile without JavaScript.

Non-goals:

- Reproduce every extension setting on the marketing page.
- Turn the landing page into full documentation.
- Add analytics, accounts, tracking, or a backend.
- Add animation or visual effects that do not improve comprehension.

Success signals:

- A visitor can identify what FocusTube does within a few seconds.
- Store links are visible without scrolling on common desktop sizes.
- The live root URL serves the product landing page rather than the repository README.

## Personas and jobs

Primary personas:

- Students who need YouTube or social platforms for useful tasks but get pulled into short-form feeds.
- Knowledge workers who want to keep access to specific social-site functions without blocking entire domains.
- Privacy-conscious users who prefer a local, open-source extension.

Primary jobs:

- Understand what FocusTube blocks.
- Decide whether it fits the user's browsing habits.
- Install it in the user's browser.
- Verify that it does not track browsing activity.

## Information architecture

Public landing page hierarchy:

1. Header with FocusTube brand, key navigation, GitHub, and install action.
2. Hero with the core promise, browser install links, current project proof, and a product-control preview.
3. Supported-platform strip.
4. Short explanation of how FocusTube removes distracting surfaces while keeping useful pages available.
5. Privacy section.
6. Final install action.
7. Minimal footer with source link.

The README remains developer/project documentation and must not be used as the public landing-page entry file.

## Design principles

1. **Product before prose.** Show what the extension does before explaining every detail.
2. **One primary action.** Chrome is the main install CTA; Firefox and Edge remain visible secondary actions.
3. **Use real product language.** Prefer terms already used by FocusTube and avoid generic productivity slogans.
4. **Trust through restraint.** Privacy and open-source facts should be specific and verifiable, not exaggerated.
5. **No visual filler.** Every panel, border, label, and metric must carry product information.
6. **Preserve brand continuity.** The existing FocusTube blue is intentional product branding, not a default landing-page choice.

## Visual language

Color:

- Base: near-black neutral background.
- Surfaces: restrained dark gray layers.
- Text: high-contrast white with muted gray secondary copy.
- Accent: existing FocusTube blue `#4facfe` with a lighter hover state.
- Success state: muted green only for explicit enabled/status feedback.

Typography:

- System-first sans-serif stack using Inter when available.
- Large but controlled hero type; no oversized display text that overwhelms the product preview.
- Body copy at comfortable reading sizes with short line lengths.

Spacing:

- Wide desktop breathing room with tighter mobile spacing.
- Prefer separators and whitespace over stacking many boxed cards.

Shape and elevation:

- Moderate corner radii on interactive/product-preview surfaces.
- Borders provide separation; avoid gratuitous drop shadows and glow effects.

Motion:

- No required motion. Hover transitions should be subtle and functional.

Imagery and iconography:

- Use the real FocusTube extension icon.
- Product preview should reflect actual controls and terminology rather than a fake browser window.

## Components

Landing-page components:

- `site-header`: brand, navigation, install shortcut.
- `store-actions`: Chrome primary action plus Firefox and Edge secondary actions.
- `product-shot`: static representation of the extension control surface.
- `supported-strip`: supported-site names.
- `feature-rows`: three concise product behaviors.
- `privacy-section`: direct privacy statement plus specific trust facts.
- `install-section`: final install prompt.
- `site-footer`: brand/source closure.

Token ownership:

- Landing-page tokens live in the landing-page stylesheet and must not modify the extension's root `styles.css`.
- Extension UI tokens remain owned by the extension stylesheet.

## Accessibility

Target: WCAG 2.2 AA where practical for the static landing page.

- Semantic `header`, `nav`, `main`, `section`, and `footer` structure.
- Visible keyboard focus on links and controls.
- Decorative icon images use empty alt text; meaningful text remains in the DOM.
- Maintain readable text/background contrast.
- Do not require hover, animation, or color alone to understand content.
- Respect reduced-motion expectations by keeping motion minimal and nonessential.

## Responsive behavior

Desktop:

- Two-column hero with copy and product preview.
- Full navigation visible.
- Privacy content can use two columns.

Tablet:

- Hero and privacy sections collapse to one column.
- Product preview moves below the hero copy.

Mobile:

- Hide nonessential header links while preserving the install action.
- Stack platform preview items and install controls when needed.
- Keep tap targets comfortably sized.
- Prevent horizontal overflow except the intentionally scrollable supported-platform strip.

## Interaction states

The public page is static and has no application loading state.

- Links: default, hover, and keyboard-focus states.
- Install buttons: clear default and hover/focus states.
- Product preview controls are illustrative, not interactive, and must not imply that settings can be changed on the website.
- If an external store is unavailable, the page itself remains usable and the other store/GitHub links remain available.

## Content voice

- Short, direct, and specific.
- Prefer plain language such as "Hide short-form feeds" over marketing jargon.
- Use "FocusTube" consistently.
- Do not claim certification, auditing, or privacy guarantees beyond what the repository supports.
- Do not invent user counts, ratings, time-saved figures, or blocked-count values.

## Implementation constraints

- Static HTML and CSS only for the landing page.
- No JavaScript, analytics, tracking pixels, external runtime dependencies, or backend.
- GitHub Pages currently publishes from `main` at the repository root, so the public entry file must be root `index.html` unless Pages settings are deliberately changed later.
- Do not overwrite the extension's root `styles.css`; the landing page uses its own stylesheet.
- Store URLs and GitHub URL must remain the official existing links.
- Required repository CI, CodeQL, and release-verification checks must stay green.
- Public-page changes should be checked at desktop and mobile widths before being considered finished.

## Open questions

- [ ] Replace the illustrative extension preview with a polished real product screenshot if a stable screenshot asset is added later. **Owner:** maintainer. **Impact:** medium.
- [ ] Decide later whether project-impact numbers should remain hard-coded on the landing page or be removed to avoid stale public metrics. **Owner:** maintainer. **Impact:** low.
