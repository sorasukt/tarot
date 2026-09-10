# CSS structure

CSS is now organized by responsibility:

- `core/` — shared layout, typography, interaction and global enhancements.
- `components/` — reusable feature components.
- `pages/` — styles owned by a specific page or product surface.

## Compatibility

Existing HTML paths are intentionally preserved through lightweight `@import` entrypoints at their former locations. This keeps current pages and open links working while new work can import canonical files from `assets/css/` directly.

## Rules for new styles

1. Put shared primitives in `core/` only when they are used by multiple pages.
2. Put reusable UI pieces in `components/`.
3. Put page-only selectors in `pages/`.
4. Do not add new large CSS files at repository root.
5. Avoid page-specific selectors in `core/`; migrate them gradually when touching that feature.

Legacy `style.css`, `shuffle.css`, `admin/admin.css`, and `history/history.css` remain in place for now because they should be audited for page-relative assets before moving.

## Shared transitions

`core/transitions.css` owns the ten Transitions.dev motion primitives and tokens.
It is imported once through `portal.css` after the base portal rules. `components/tabs.css`
now contains only feature/responsive layout; do not redefine `.t-tab` motion there.

- `.t-resize`: explicit width/height changes; `auto` interpolation is progressive enhancement.
- `.t-digit-group.is-animating > .t-digit`: use `data-stagger="1"`/`"2"` or `--digit-index` for longer values.
- `.t-text-swap`: use `TarotPortal.swapText(node, text)` for text-only status nodes. Pass `""` before replacing them with error/result markup; the helper cancels stale timers.
- `.t-dropdown`, `.t-modal`: `.is-open` / `.is-closing`, with visibility preventing hidden descendants from receiving focus. The caller still manages focus, inert, hidden and final removal.
- `.t-panel-slide[data-open="true"]`: reveal a panel; default travel is a restrained 16px, overridable locally.
- `.t-stagger.is-shown`: reveal `.t-stagger-line`; `--stagger-index` generalizes delays. `.is-hiding` fades together.
- `.t-tabs`: existing account/payment controllers measure the pill on selection and resize. Controls have a 44px minimum target.
- `.t-shimmer[data-text]`: use only for active loading, keep duplicate text synchronized and escaped. Visible text remains the accessible source.
- `.t-check`: supports the supplied `aria-checked` contract or `input:checked + svg`. Prefer a native checkbox; for custom controls the caller must implement keyboard and state behavior. Set `--check-len` to the actual SVG path length.

Current integrations: mobile navigation, existing modal entrance/discrete backdrop exit,
loading shimmer, daily status text swap and staggered reading, birthday number pop,
result/account-panel reveal and existing sliding tabs. Resize and checkbox utilities
are available for controls whose dimensions/check artwork need them; do not add
unnecessary motion to every component.

No permanent `will-change` allocations. Reduced motion disables transitions, blur
movement and shimmer. Modal removal animates where `transition-behavior: allow-discrete`
is supported; older browsers close immediately. No animation gates result delivery or
usage accounting. Browser/device animation QA is still required before release.
