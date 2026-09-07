import type { Config } from "tailwindcss";

/**
 * Design tokens for the investigation dashboard (task section 2: "premium
 * enterprise fintech/compliance product... avoid generic SaaS templates").
 * `brand` (a deep slate/navy) is this product's own chrome color — buttons,
 * nav, focus rings — deliberately not a generic purple/indigo SaaS default.
 * `chart`/`status` reuse the dataviz skill's validated palette verbatim
 * (categorical hues, sequential blue ramp, diverging blue<->red, and the
 * fixed status colors) so every chart in the app passes the skill's
 * colorblind-safety validator without re-deriving it per component.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#eef2f7",
          100: "#d7e0ec",
          200: "#b0c1da",
          300: "#7f99bd",
          400: "#4f6f98",
          500: "#2f5178",
          600: "#1f3c5e",
          700: "#172e49",
          800: "#101f33",
          900: "#0a1420",
          950: "#050a10",
        },
        surface: {
          DEFAULT: "#fcfcfb",
          page: "#f7f8fa",
          raised: "#ffffff",
          sunken: "#f1f3f6",
          dark: "#0d1117",
          "dark-raised": "#151b23",
          "dark-page": "#090c10",
        },
        ink: {
          primary: "#0b0e14",
          secondary: "#4a5264",
          muted: "#7c8494",
          "dark-primary": "#f4f6f9",
          "dark-secondary": "#b7c0cf",
          "dark-muted": "#7c8494",
        },
        line: {
          DEFAULT: "#e3e6ec",
          dark: "#232a35",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
        chart: {
          1: "#2a78d6",
          2: "#eb6834",
          3: "#1baf7a",
          4: "#eda100",
          5: "#e87ba4",
          6: "#008300",
          7: "#4a3aa7",
          8: "#e34948",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(11,14,20,0.04), 0 1px 6px -2px rgba(11,14,20,0.06)",
        popover: "0 8px 24px -4px rgba(11,14,20,0.16), 0 2px 8px -2px rgba(11,14,20,0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
