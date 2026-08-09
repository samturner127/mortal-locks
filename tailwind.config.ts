import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        field: "#0B1220",      // deep navy background, like a night game
        panel: "#121B2E",      // card / scoreboard surface
        panelLine: "#233047",  // hairline borders on panels
        ink: "#E8EDF5",        // primary text
        mute: "#5B6B84",       // secondary text
        amber: "#F5A623",      // scoreboard amber — primary accent
        teal: "#2DD4BF",       // win / correct indicator
        loss: "#E5484D",       // loss / miss indicator
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      letterSpacing: {
        widest2: "0.18em",
      },
      boxShadow: {
        board: "0 0 0 1px #233047, 0 20px 40px -20px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
export default config;
