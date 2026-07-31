import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Bunal.club — Book sports courts across Bohol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public", "bunal-logo-transparent.png")
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#10243a",
          color: "white",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: "-120px",
            top: "-160px",
            width: "520px",
            height: "520px",
            borderRadius: "999px",
            background: "#16803c",
            opacity: 0.35,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "420px",
            height: "172px",
            borderRadius: "24px",
            background: "white",
            padding: "18px 24px",
          }}
        >
          <img
            src={logoSrc}
            alt=""
            width={372}
            height={153}
            style={{ objectFit: "contain" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#a3ce3c",
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Bohol, Philippines
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "16px",
              maxWidth: "900px",
              fontSize: "68px",
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Find, book, and pay for courts in seconds.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "24px",
              gap: "24px",
              color: "rgba(255,255,255,0.72)",
              fontSize: "24px",
            }}
          >
            <span>Pickleball</span>
            <span>•</span>
            <span>Badminton</span>
            <span>•</span>
            <span>Volleyball</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
