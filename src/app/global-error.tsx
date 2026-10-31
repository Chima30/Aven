"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>AVEN hit an unexpected problem</h1>
          <p style={{ color: "#586274" }}>Please try again.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 12,
              border: 0,
              background: "#14243d",
              color: "#f6f4ef",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
