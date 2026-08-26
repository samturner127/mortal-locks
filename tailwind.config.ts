import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        field: "#08090C",      // near-black, so the ember accent actually glows
        panel: "#131419",      // card / scoreboard surface
        panelLine: "#262931",  // hairline borders on panels
        ink: "#F2EFE9",        // primary text — warm off-white, not blue-white
        mute: "#7C818C",       // secondary text (AA on both field and panel)
        amber: "#FF7A18",      // ember orange — primary accent
        teal: "#3FB950",       // win / correct indicator
        loss: "#EE4B48",       // loss / miss indicator — the only other loud color
        onLoss: "#1F2024",     // text laid on top of a loss-red fill
        blue: "#58A6FF",       // a double down that came in
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
        board: "0 0 0 1px #262931, 0 24px 48px -24px rgba(0,0,0,0.8)",
      },
    },
  },
  plugins: [],
};
export default config;
