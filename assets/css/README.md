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
