import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0B1B33",
          900: "#07122A",
          800: "#0B1B33",
          700: "#122A4D",
          600: "#1B3A66",
          500: "#27507F",
        },
        gold: {
          DEFAULT: "#C9A961",
          300: "#EBD9A6",
          400: "#DFC37F",
          500: "#C9A961",
          600: "#B08E43",
        },
        ivory: {
          DEFAULT: "#F7F3EA",
          100: "#FBF9F3",
          200: "#F7F3EA",
          300: "#EDE6D6",
          400: "#D8CDB5",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "'Noto Serif KR'", "Georgia", "serif"],
        sans: ["'Pretendard Variable'", "Pretendard", "-apple-system", "BlinkMacSystemFont", "'Apple SD Gothic Neo'", "'Noto Sans KR'", "system-ui", "sans-serif"],
      },
      boxShadow: { gold: "0 0 0 1px rgba(201,169,97,0.35), 0 12px 40px -12px rgba(201,169,97,0.35)" },
    },
  },
  plugins: [animate],
};
export default config;
