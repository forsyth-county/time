"use client";

export function GridBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b0c10] via-[#0f1119] to-[#0b0c13]" />

      {/* Soft bokeh wash */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(91,140,255,0.12), transparent 45%), radial-gradient(circle at 85% 15%, rgba(155,123,255,0.1), transparent 42%), radial-gradient(circle at 70% 80%, rgba(125,211,252,0.08), transparent 46%)",
          animation: "gradient-drift 26s ease-in-out infinite",
        }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-blue-500/6 rounded-full blur-3xl" />

      {/* Floating glow orb */}
      <div
        className="absolute top-1/4 right-1/4 w-[460px] h-[460px] bg-purple-500/7 rounded-full blur-3xl"
        style={{ animation: "glow-float 16s ease-in-out infinite" }}
      />

      {/* Subtle noise overlay */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-soft-light" style={{ backgroundImage: "repeating-radial-gradient(circle at 0 0, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 2px, transparent 4px)" }} />

      <style jsx>{`
        @keyframes gradient-drift {
          0% {
            background: radial-gradient(circle at 15% 20%, rgba(91,140,255,0.12), transparent 45%), radial-gradient(circle at 85% 15%, rgba(155,123,255,0.1), transparent 42%), radial-gradient(circle at 70% 80%, rgba(125,211,252,0.08), transparent 46%);
          }
          50% {
            background: radial-gradient(circle at 30% 70%, rgba(125,211,252,0.1), transparent 45%), radial-gradient(circle at 70% 30%, rgba(91,140,255,0.08), transparent 42%), radial-gradient(circle at 80% 85%, rgba(155,123,255,0.08), transparent 46%);
          }
          100% {
            background: radial-gradient(circle at 15% 20%, rgba(91,140,255,0.12), transparent 45%), radial-gradient(circle at 85% 15%, rgba(155,123,255,0.1), transparent 42%), radial-gradient(circle at 70% 80%, rgba(125,211,252,0.08), transparent 46%);
          }
        }
        @keyframes glow-float {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(-30px, 20px); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
