import type { Config } from "tailwindcss";

const config: Config = {
  // Tell Tailwind where your class names live (all code in /src)
  content: ["./src/**/*.{ts,tsx,js,jsx}"],

  theme: {
    // Center pages nicely and set a comfy max-width
    container: { center: true, padding: "1rem", screens: { "2xl": "1120px" } },

    // Nuvvy tokens: colors, radii, shadows, fonts
    extend: {
      colors: {
        // New maintenance page colors
        yellow: "#FEEA3B", // bright yellow primary
        green:  "#1A6432", // natural dark green
        "green-dark": "#0F3E2E", // deep green for text
        cream:  "#FAFAF6", // off-white background
        
        // Legacy tokens for compatibility
        leaf:  "#22A559", // primary CTA
        fern:  "#0EA5A3", // secondary accent
        butter:"#F6F2E9", // page background
        ink:   "#1F2937", // main text
        mist:  "#EEF6F1", // soft surfaces/hover
        cane:  "#D4B996", // warm accent
        forest:"#0F3E2E", // deep premium green

        // Helpful semantic names for components
        brand:  { DEFAULT: "#22A559", fg: "#FFFFFF", subtle: "#EEF6F1" },
        accent: { DEFAULT: "#0EA5A3", subtle: "#E9F7F6" },
        surface:{ DEFAULT: "#FFFFFF", muted: "#F8F9F8", alt: "#F6F2E9" },
        text:   { DEFAULT: "#1F2937", muted: "#6B7280", onBrand: "#FFFFFF" },
        border: { DEFAULT: "#E5E7EB", subtle: "#EEF2F7" },
      },
      borderRadius: { lg: "14px", xl: "16px", "2xl": "20px", pill: "999px" },
      boxShadow: {
        soft: "0 10px 20px rgba(34,165,89,0.10)",
        card: "0 8px 16px rgba(0,0,0,0.06)",
        subtle: "0 2px 6px rgba(0,0,0,0.05)",
      },
      spacing: { 13: "3.25rem", 15: "3.75rem", 18: "4.5rem", 22: "5.5rem" },
      transitionDuration: { DEFAULT: "250ms" },
      transitionTimingFunction: { smooth: "cubic-bezier(0.22, 1, 0.36, 1)" },
      fontFamily: {
        sans: ["Inter","system-ui","Segoe UI","Roboto","Helvetica","Arial","sans-serif"],
        display: ["Playfair Display","Inter","system-ui","sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;