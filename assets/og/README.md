# Tarot social preview image

The Tarot pages currently use the existing site logo as their Open Graph and Twitter/X fallback:

`https://sorasukt.com/img/logo.png`

When a dedicated cover is ready, place it at `tarot/assets/og/tarot-cover.jpg` and update the metadata in `tarot/index.html`.

Recommended master/export specification:

- Size: 1200 × 630 px
- Aspect ratio: 1.91:1
- Format: JPEG (recommended for broad crawler compatibility) or PNG
- Target file size: ideally under 500 KB; keep below ~1 MB where practical
- Color space: sRGB
- Keep key logo/title/artwork inside a generous safe area so crops on social platforms do not remove important content
- Avoid tiny text; the image should remain readable when reduced on mobile

Do not commit an empty placeholder image because crawlers cache invalid previews for long periods.
