---
name: Helm Design System
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#c6c6cb'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#909095'
  outline-variant: '#45474b'
  surface-tint: '#c6c6cc'
  primary: '#c6c6cc'
  on-primary: '#2f3035'
  primary-container: '#0f1115'
  on-primary-container: '#7b7c82'
  inverse-primary: '#5d5e63'
  secondary: '#e9c176'
  on-secondary: '#412d00'
  secondary-container: '#604403'
  on-secondary-container: '#dab36a'
  tertiary: '#4ae183'
  on-tertiary: '#003919'
  tertiary-container: '#001506'
  on-tertiary-container: '#00904a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e8'
  primary-fixed-dim: '#c6c6cc'
  on-primary-fixed: '#1a1c20'
  on-primary-fixed-variant: '#45474b'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#6bfe9c'
  tertiary-fixed-dim: '#4ae183'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005228'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-tabular:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 20px
  lg: 32px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style
The design system is anchored in the "Standing Watch" narrative—a sentinel of financial precision and automated security. It targets high-net-worth DeFi investors and meticulous stock analysts who require a high-density, low-friction interface.

The aesthetic follows a **High-End Fintech** movement, blending **Minimalism** with subtle **Glassmorphism**. The interface is dark, utilizing deep atmospheric layers to separate data sets, while precise accents provide immediate clarity on "Fair Price" and "Actionable Insights." The emotional response is one of calm authority, reliability, and institutional-grade sophistication.

## Colors
This design system utilizes a specialized dark palette to reduce eye strain during deep data analysis while highlighting critical financial signals.

- **Obsidian (#0F1115):** The primary background base. Deep, immersive, and stable.
- **Deep Slate (#1E293B):** Used for container layering and surface elevation.
- **Helm Gold (#C5A059):** Reserved for primary actions, navigation markers, and premium status indicators. It represents value and wisdom.
- **Fair Price Green (#2ECC71):** A specific accent for healthy market indicators, buy signals, and "safe" vault states.
- **Alert Crimson (#E74C3C):** Used sparingly for liquidations, high-risk warnings, and negative price action.
- **Data Neutral (#94A3B8):** A mid-tone grey for secondary metadata and inactive labels.

## Typography
Typography is split into three functional roles to maximize technical clarity:
- **Headlines (Hanken Grotesk):** Provides a contemporary, sharp, and confident voice for section headers and page titles.
- **Interface & Body (Geist):** A technical, highly legible sans-serif for reading logs, descriptions, and settings.
- **Data & Metrics (JetBrains Mono):** A monospaced font used specifically for wallet addresses, token balances, and stock tickers to ensure alignment in high-density tables.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a hard-edge 4px baseline rhythm. 

- **Desktop:** 12-column grid with wide 48px margins to give data "breathing room." Gutters are fixed at 24px to maintain structural rigidity.
- **Tablet:** 8-column grid with 24px margins. Elements should collapse into stacked vertical cards if data density becomes illegible.
- **Mobile:** 4-column grid with 16px margins. Primary vault metrics and the "Buy/Sell" toggle must remain sticky or within the first fold.

Content prioritization is "Metric First." The most critical vault APY or Stock Price always occupies the top-left quadrant of any container.

## Elevation & Depth
Depth is created through **Tonal Layering** rather than traditional drop shadows. This preserves the "Technical" feel of the system.

- **Level 0 (Base):** Obsidian (#0F1115). Used for the global background.
- **Level 1 (Card):** Deep Slate (#1E293B) with a subtle 1px inner border of #334155 (10% opacity). This creates a "machined" look.
- **Level 2 (Modal/Overlay):** A semi-transparent layer of Deep Slate with a 20px **Backdrop Blur**. This gives the impression of glass over a dark void.
- **Indicators:** Active states use a soft outer glow in Helm Gold or Fair Price Green (5px blur, 20% opacity) to signify focus without appearing decorative.

## Shapes
This design system uses **Soft** roundedness to strike a balance between industrial precision and modern accessibility.

- **Buttons & Inputs:** Use the base `0.25rem` (4px) corner radius. This sharp look reinforces the "Professional Tool" aesthetic.
- **Main Containers/Cards:** Use `rounded-lg` (8px) to subtly distinguish major UI sections from smaller components.
- **Selection Chips:** Use pill-shaped rounding only for "Status" tags (e.g., "Active," "Staked") to differentiate them from functional buttons.

## Components
- **Buttons:** Primary buttons use a solid Helm Gold fill with dark text. Secondary buttons use a ghost style with a 1px Slate border. All buttons have a high-hover state involving a subtle increase in inner glow.
- **Vault Cards:** Must feature a "Pulse" indicator in the top right—Fair Price Green if the vault is optimized, Alert Crimson if rebalancing is required.
- **Input Fields:** Dark backgrounds (#0F1115) with a bottom-only 2px border that turns Helm Gold on focus.
- **Data Tables:** Row-based with no vertical lines. Hovering over a row highlights it with a slight tonal shift to Deep Slate.
- **Charts:** Use thin 1.5px strokes for price lines. Area charts should use a vertical gradient from the accent color to transparent.
- **Chips:** Small, geometric tags for categories like "DeFi," "Tech," or "Energy," using all-caps typography.