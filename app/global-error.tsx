"use client";

import { OctagonAlert } from "lucide-react";

/**
 * Last-resort error boundary.
 *
 * Replaces the whole document, so it carries its own html/body and cannot rely
 * on the app's providers or theme being available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#17191f",
          color: "#f2f3f5",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <OctagonAlert
            style={{ width: 32, height: 32, margin: "0 auto 1rem", color: "#e5484d" }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
            Sentinel could not render this page
          </h1>
          <p style={{ fontSize: "0.8125rem", lineHeight: 1.6, color: "#a8adb8", margin: "0 0 1.25rem" }}>
            An unexpected error occurred.
            {error.digest ? ` Quote reference ${error.digest} if you report this.` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#3b6fd4",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "0.5rem 1rem",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
