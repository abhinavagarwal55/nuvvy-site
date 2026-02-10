/**
 * Homepage configuration
 * Controls feature flags and variant toggles for the homepage
 */

export type HeroVariant = "classic" | "snabbit";

export const HOMEPAGE_CONFIG = {
  /**
   * Hero variant selector
   * - "classic": Existing hero carousel (default)
   * - "snabbit": New Snabbit-style hero (WIP)
   */
  heroVariant: "snabbit" as HeroVariant,
} as const;
