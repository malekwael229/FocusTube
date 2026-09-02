# Design

## Source of truth

**Status:** Draft  
**Date:** September 2, 2026  
**Product surfaces:** FocusTube GitHub Pages homepage and five platform-specific search pages.

Evidence reviewed:

- Current FocusTube README, feature names, store links, privacy model, impact figures, and OpenSSF wording.
- Current extension visual language and the existing FocusTube promotional screenshots supplied by the maintainer.
- GitHub Pages branch/folder publishing guidance.
- Google Search documentation for crawlable links, canonical URLs, and XML sitemaps.
- WCAG 2.2 guidance for visible keyboard focus.

## Brand

FocusTube should feel focused, practical, private, and trustworthy. The product is a small tool that removes specific distractions while keeping useful websites available.

Trust signals:

- Real extension screenshots.
- Official browser-store links.
- Local-only privacy model.
- Open-source repository and MIT license.
- OpenSSF Best Practices Passing and Baseline Level 1, described without implying an audit or certification.

Avoid:

- Generic SaaS layouts, giant decorative gradients, floating dashboard cards, fake testimonials, fake browser windows, stock illustrations, and invented metrics.
- Copy such as “supercharge,” “unlock your potential,” “revolutionize,” or “seamless.”
- Letting text overlap screenshots at any viewport width.

## Product goals

Goals:

- Explain the product and its difference from whole-site blockers within the first screen.
- Make installation obvious for Chrome, Firefox, and Edge.
- Use real product visuals as proof.
- Create useful platform pages that can earn search traffic without becoming near-duplicate SEO spam.
- Keep the site static, fast, private, accessible, and easy to maintain.

Non-goals:

- Interactive extension demo.
- Accounts, analytics, tracking, cookies, backend services, remote fonts, frameworks, or build tooling.
- Publishing unverified live metrics.

Success signals:

- Zero text/image overlap and zero horizontal overflow from 320px upward.
- Store links remain prominent and correct.
- Every public page has unique title, description, canonical URL, and useful platform-specific content.

## Personas and jobs

Primary visitors are students, developers, researchers, remote workers, and other people who still need YouTube or social platforms for useful tasks.

Jobs:

- Understand what FocusTube blocks and what stays usable.
- Compare Strict, Warn, and Passive modes.
- Check privacy before installing.
- Install from the preferred official store.
- Inspect source code and project practices.

## Information architecture

Public routes:

- `/FocusTube/`
- `/FocusTube/block-youtube-shorts/`
- `/FocusTube/instagram-reels-blocker/`
- `/FocusTube/tiktok-blocker/`
- `/FocusTube/facebook-reels-blocker/`
- `/FocusTube/linkedin-feed-blocker/`

Homepage hierarchy:

1. Header and install action.
2. Two-column hero with copy and real UI screenshot, never layered.
3. Targeted-blocking explanation and before/after proof.
4. Supported platforms.
5. Blocking modes with real overlay screenshot.
6. Privacy statement.
7. Focus tools as secondary functionality.
8. Open-source trust and dated approximate impact.
9. Final install action and footer.

Topic pages use the same header/footer and focus on one platform: problem, what FocusTube changes, what remains available, mode behavior, privacy, related pages, and install action.

## Design principles

1. **Proof before claims.** Prefer real screenshots and specific behavior.
2. **Separate content from imagery.** Text and screenshots occupy normal layout columns; no absolute-position overlap tricks.
3. **Quiet hierarchy.** Use spacing, typography, borders, and one cyan accent instead of decoration-heavy effects.
4. **Primary job first.** Distraction blocking leads; timer/stats stay secondary.
5. **Be precise about limits.** Platform pages describe supported surfaces without promising permanent immunity to upstream UI changes.

## Visual language

- Background: near-black navy.
- Raised surfaces: slightly lighter navy.
- Primary text: soft white.
- Secondary text: cool gray-blue.
- Primary accent: FocusTube cyan/blue.
- Strict and Warn use restrained red and amber only where they carry meaning.
- Typography: system sans-serif stack, bold compact headings, 65–72 character reading width.
- Corners: 10–14px on larger media/surfaces, 8–10px on controls.
- Motion: subtle hover movement only; disabled under reduced-motion preferences.
- Images: only real FocusTube promotional assets and the existing FocusTube icon.

## Components

- Header: brand, section navigation, GitHub, Chrome CTA.
- Store actions: Chrome primary, Firefox and Edge secondary.
- Hero proof frame: full uncropped real UI screenshot.
- Comparison section: concise explanation plus existing before/after screenshot.
- Platform list: five linked rows, not a wall of identical cards.
- Mode section: three textual mode explanations beside the existing Strict/Warn image.
- Privacy band: concrete local-only facts.
- Trust strip: GitHub, MIT, OpenSSF badges, dated approximate impact.
- Topic page: breadcrumb, focused heading, behavior list, related platform links, install block.

## Accessibility

Target WCAG 2.2 AA where practical.

- Semantic landmarks and one H1 per page.
- Skip link.
- Strong visible `:focus-visible` outline.
- Keyboard-accessible native links only; no custom menu JavaScript.
- Minimum 44px primary touch targets on mobile.
- Meaningful alt text for product screenshots.
- Reduced motion respected.
- Color never used as the only indicator of mode.

## Responsive behavior

- Desktop: hero uses two independent grid columns with 48–64px gap.
- Tablet: hero stacks before either column becomes cramped.
- Mobile: one column; store buttons become full width; screenshots remain fully visible with `width:100%; height:auto` and no cropping.
- Header wraps naturally instead of requiring a scripted hamburger.
- No global `overflow-x:hidden`; layout must naturally fit the viewport.

## Interaction states

- Links and buttons have default, hover, active, and visible keyboard focus states.
- No forms, saved state, overlays, autoplay, or loading UI.
- External links remain normal links.

## Content voice

Short, normal, factual, and specific.

Use “block” for routes/interstitials and “hide” for UI/navigation/feed elements. Avoid inflated productivity language and unsupported comparisons.

## Implementation constraints

- Plain HTML and CSS only.
- No JavaScript unless a real accessibility/navigation need appears.
- No framework, package change, remote scripts, analytics, tracking, cookies, backend, or remote fonts.
- Intended publishing source: `main /docs` if approved later.
- Relative internal links and assets must work at the GitHub Pages project path.
- Canonicals and sitemap use absolute `https://malekwael229.github.io/FocusTube/` URLs.
- Root `DESIGN.md` remains the design source of truth.

## Open questions

- [ ] Final visual approval from the maintainer before any repository write. Owner: maintainer. Impact: blocks publishing only.
- [ ] Submit sitemap in Google Search Console after deployment. Owner: maintainer. Impact: discovery only.
