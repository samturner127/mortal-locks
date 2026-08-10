import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Mortal Locks" — a pick is final the instant you submit it, no
        // exceptions. Black-and-red, like the stakes are real.
        field: "#0A0505",      // near-black background, warmed toward char/ember
        panel: "#170A0A",      // card surface — a shade lighter than the void
        panelLine: "#3D1414",  // dried-blood hairline borders on panels
        ink: "#F2E4D8",        // primary text — bone/ash white
        mute: "#8A5D5D",       // secondary text — dull brick red
        amber: "#E8432C",      // primary accent — hot ember (token name kept for minimal diff)
        teal: "#8FBF3F",       // win / correct indicator — sickly brimstone green, kept distinct from the reds
        loss: "#B4182A",       // loss / miss indicator — deep blood red
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
        board: "0 0 0 1px #3D1414, 0 20px 40px -20px rgba(0,0,0,0.8), 0 0 24px -8px rgba(232,67,44,0.15)",
      },
    },
  },
  plugins: [],
};
export default config;
