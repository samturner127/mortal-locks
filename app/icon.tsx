import { ImageResponse } from "next/og";

// Favicon / PWA icon, generated at build time so there's no binary asset to
// keep in sync with the palette — the ember and near-black below are the
// `amber` and `field` tokens from tailwind.config.ts.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
        <svg viewBox="0 0 64 64" width="48" height="48">
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
