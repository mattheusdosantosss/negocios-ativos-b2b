import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta extraída do CSS oficial da PSA
        psa: {
          orange: "#FF640F",
          "orange-hover": "#FF7F3F",
          "orange-soft": "#FFF1E8",
          blue: "#053CAA",
          "blue-hover": "#0A4DC4",
          "blue-soft": "#EEF2FB",
          ink: "#2C2C2C",
          "ink-soft": "#4A4A4A",
          muted: "#806D61",
          line: "#E8E5E1",
          surface: "#FFFFFF",
          canvas: "#FAF8F5",
        },
      },
      fontFamily: {
        // Referenciam as CSS vars setadas em globals.css (que apontam pras
        // fontes carregadas via next/font em app/layout.tsx).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(44,44,44,0.04), 0 4px 12px rgba(44,44,44,0.04)",
        "card-hover": "0 2px 4px rgba(44,44,44,0.06), 0 8px 24px rgba(44,44,44,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
