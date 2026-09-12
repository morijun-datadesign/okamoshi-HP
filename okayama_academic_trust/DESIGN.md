---
name: Okayama Academic Trust
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#414944'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#717973'
  outline-variant: '#c0c9c2'
  surface-tint: '#3a6752'
  primary: '#134230'
  on-primary: '#ffffff'
  primary-container: '#2d5a46'
  on-primary-container: '#9fcfb6'
  inverse-primary: '#a1d1b8'
  secondary: '#a23e18'
  on-secondary: '#ffffff'
  secondary-container: '#fe8357'
  on-secondary-container: '#6f2000'
  tertiary: '#4f3600'
  on-tertiary: '#ffffff'
  tertiary-container: '#6c4c00'
  on-tertiary-container: '#f1bd5a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bceed3'
  primary-fixed-dim: '#a1d1b8'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#224f3c'
  secondary-fixed: '#ffdbcf'
  secondary-fixed-dim: '#ffb59c'
  on-secondary-fixed: '#390c00'
  on-secondary-fixed-variant: '#822801'
  tertiary-fixed: '#ffdea7'
  tertiary-fixed-dim: '#f2be5b'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5e4200'
  background: '#fcf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e1'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: '0'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: '0'
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.015em
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4.5rem
  space-4xl: 6rem
  gutter-mobile: 1rem
  gutter-desktop: 1.5rem
  container-max: 75rem
---

## Brand & Style

This design system is tailored for regional standardized high school entrance examination mock tests (おかもし / Okayama Prefecture Mock Exams). The primary audience encompasses middle school students facing rigorous academic milestones, their anxiety-conscious parents, and academic cram school (juku) instructors seeking reliable diagnostic data.

The visual direction marries traditional academic authority with a calming, stress-reducing Japanese regional aesthetic. Drawing from contemporary Japanese editorial web design and modern organic minimalism, the UI avoids harsh utilitarian cram-school tropes (such as overwhelming red ribbons and chaotic badge clutter) in favor of clear structure, gentle reassurance, and transparent information architecture.

- **Tone & Mood:** Studious, dependable, encouraging, serene, and prestigious without feeling unapproachable.
- **Visual Personality:** Grounded earth tones reminiscent of Korakuen and Kurashiki aesthetics—rich forest moss, warm unglazed pottery terracotta, and textured washi-like off-whites.
- **Experience Goals:** Minimize test anxiety, establish unquestioned empirical trust in diagnostic scores, and guide users effortlessly through multi-stage registration flows.

## Colors

The palette grounds the interface in intellectual stability through deep vegetal greens while directing decision actions with high-energy warm terracotta.

### Palette Roles
- **Primary (`#2D5A46` / Deep Moss Green):** Anchor color for institutional trust, top-tier navigation bars, key section headers, and primary emphasis surfaces. Deep variation `#1E3D2F` serves high-contrast active states; light tint `#EBF3EE` functions as container fills and table alternating row highlights.
- **Secondary (`#C85A32` / Terracotta Clay):** High-conversion accent reserved strictly for actionable commitments: primary application CTA buttons, registration countdown badges, urgent application deadline warnings, and critical pass/fail indicator markers.
- **Tertiary (`#D4A343` / Warm Mustard Ochre):** Supportive functional accent for honor badges, deviation score (偏差値) achievements, and tertiary highlight tags.
- **Neutral Surface Canvas (`#FBFBFA` to `#F5F6F3`):** Eye-friendly unbleached paper tones that protect sustained reading stamina during prolonged examination syllabus reviews.
- **Neutral Text (`#262626` / Ink Charcoal):** Replaces harsh pure black to reduce optical glare while maintaining full AAA accessibility compliance against all tinted ivory backgrounds.

## Typography

The typographic hierarchy pairs the contemporary geometric clarity of Plus Jakarta Sans for alphanumeric headings, dates, score metrics, and navigational structures, with Noto Sans for extended Japanese editorial paragraphs and examination guidelines.

### Implementation Guidelines
- **Japanese Micro-Rhythm:** Body text maintains generous line heights (1.75x to 1.8x fontSize) and subtle positive tracking (`0.015em`) to ensure absolute readability for kanji-heavy academic syllabi.
- **Numbers & Metrics:** Use tabular or proportional lining figures for test scores, percentiles, deviations, dates, and yen values to emphasize scientific rigor.
- **Parental Legibility:** Small labels never fall below 11px on mobile, preserving readability for older guardians reviewing examination protocols on handheld devices.

## Layout & Spacing

The system adopts a structured 12-column responsive fluid grid inside a constrained maximum width of `1200px` (`75rem`), maintaining disciplined alignment and formal educational trust.

### Breakpoints & Spatial Model
- **Mobile (< 768px):** 4-column layout with `1rem` outer gutters and `0.75rem` internal gutters. Content stacks vertically; table components enable horizontal overflow swipe with sticky left-column subjects.
- **Tablet (768px – 1024px):** 8-column layout with `1.5rem` outer gutters. Mock exam schedules transition to split-card or condensed matrix views.
- **Desktop (> 1024px):** 12-column layout with `1.5rem` to `2rem` gutters. Accommodates side-by-side comparative examination plans, persistent sticky application action bars, and multi-column test venue directories.

Rhythm is based on a foundational 8px/4px scale. Section separators rely on generous macro whitespace (`space-3xl` and `space-4xl`) rather than harsh divider lines, reinforcing clean composure and focus.

## Elevation & Depth

This system intentionally departs from aggressive skeuomorphism or stark corporate shadows, instead using **tonal layering backed by warm ambient illumination**.

### Depth Layers
- **Base Canvas:** Flat `#FBFBFA` warm surface.
- **Level 1 (Card & Module Layer):** Pure white (`#FFFFFF`) surfaces placed over the cream canvas, framed by an ultra-subtle border (`1px solid rgba(45, 90, 70, 0.08)`) and a diffused ground shadow: `0 2px 8px -2px rgba(38, 38, 38, 0.04), 0 1px 3px 0 rgba(45, 90, 70, 0.03)`.
- **Level 2 (Interactive Floating Elements & Dropdowns):** `0 10px 24px -4px rgba(30, 61, 47, 0.08), 0 4px 8px -2px rgba(30, 61, 47, 0.03)`.
- **Level 3 (Modal Dialogs & Sticky Application Nav):** `0 20px 32px -8px rgba(30, 61, 47, 0.12), 0 8px 16px -4px rgba(0, 0, 0, 0.04)`.

Terracotta interactive states receive a distinct warm tinted drop shadow (`0 6px 16px -2px rgba(200, 90, 50, 0.28)`) to pull crucial calls-to-action forward.

## Shapes

The visual language specifies controlled, approachable curvature (`roundedness: 2`). Radii scale between `8px` (`0.5rem`) for compact components and `12px` (`0.75rem`) for overarching cards, softening the stern impression of academic tests without forfeiting formality.

- **Input Fields & Small Buttons:** `8px` (`0.5rem`).
- **Cards, Content Panels, Schedule Containers:** `12px` (`0.75rem`).
- **Status Pills & Deviation Score Badges:** Fully circular (`rounded-full` / `9999px`) to create clear optical contrast against rectangular information structures.

## Components

### Buttons
- **Primary CTA (Application / 申込み):** Terracotta (`#C85A32`) solid background, pure white label text, `8px` radius, subtle top-edge highlight. Hover transitions to `#D96B43` with warm shadow expansion. Includes forward directional indicator chevron.
- **Secondary Action (Syllabus & Venue Details):** Transparent background with `1.5px` border in `#2D5A46`, text in deep moss green. Hover fills with `#EBF3EE`.
- **Tertiary / Text Link:** Inky neutral `#262626` with understated moss underline on hover.

### Mock Exam Tab Switcher
- Segmented pill container (`#EBF3EE` background) holding switchable cohorts (e.g., "中3 第1回 8月", "中3 第2回 10月", "公立高校直前模試").
- Active tab features white background, `8px` radius, crisp moss typography, and subtle ambient shadow. Inactive tabs display `#555555` neutral text with seamless hover transition.

### Schedule & Comparison Tables
- Clean border-collapsed presentation with rounded perimeter container.
- Table headers utilize `#2D5A46` background with crisp white text.
- Row zebra-striping alternates between `#FFFFFF` and `#F5F6F3`.
- Important milestone rows (e.g., Application Deadline, Results Dispatch) feature a soft `#EBF3EE` wash with an accent indicator in terracotta.

### Examination Guidelines & Caution Cards
- Encapsulated within Level 1 white cards bordered in subtle moss-tinted stroke.
- Critical warnings (photo ID, prohibited items) use a warm terracotta top border accent (3px) paired with an amber warning icon.
- Helpful hints use soft sage background fills (`#EBF3EE`) with deep moss callout icons.

### Form Inputs & Checkboxes
- **Text Inputs:** Height 44px (touch-friendly), `#FFFFFF` surface, `1px solid #D5DDD8` neutral border, `8px` radius. Focus ring: `2px solid #2D5A46` with 2px offset.
- **Checkboxes & Radios:** `20px` touch targets. Selected state filled in `#2D5A46` with sharp white tick icon.

### Trust Badges & Accreditations
- Modular inline and stacked badges highlighting "県内最大規模" (Prefecture's Largest Scale), "過去問分析40年" (40 Years of Historical Data), and official cram-school syndicate endorsements.
- Styled with circular gold-ochre (`#D4A343`) laurel-leaf iconography, crisp typography, and ivory pill framing.