import { ImageResponse } from "next/og";

export const alt = "TracePay | Financial Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#080808",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 10, fontWeight: 600 }}>TRACEPAY</div>
        <div style={{ fontSize: 88, lineHeight: 1.05, maxWidth: 900 }}>Your money leaves clues. We find them.</div>
        <div style={{ fontSize: 26, color: "#a3a3a3" }}>tracepay.co.za</div>
      </div>
    ),
    size,
  );
}
