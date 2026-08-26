import { ImageResponse } from "next/og";

// Home-screen icon for iOS. Same art as icon.tsx at 180x180 — iOS ignores
// transparency and squares the corners itself, so the near-black plate is
// deliberate rather than incidental.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090C",
        }}
      >
        <svg viewBox="0 0 64 64" width="132" height="132">
          <rect x="14" y="28" width="36" height="28" rx="7" fill="#FF7A18" />
          <circle cx="32" cy="40" r="4.5" fill="#08090C" />
          <rect x="29.5" y="42" width="5" height="9" rx="2.5" fill="#08090C" />
          <path
            d="M21 28 V20 a11 11 0 0 1 22 0 V28"
            fill="none"
            stroke="#FF7A18"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
