import { useState } from "react";
import { SurfaceCard } from "../../ui/SurfaceCard";

interface LoginGateProps {
  onSubmit: (password: string) => Promise<void>;
}

export function LoginGate({ onSubmit }: LoginGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to unlock Alpaca.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="andes-shell flex min-h-screen items-center justify-center px-5">
      <SurfaceCard className="w-full max-w-xl p-8">
        <div style={{ fontFamily: "var(--font-sharp)", color: "var(--color-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "0.74rem" }}>
          Alpaca
        </div>
        <div style={{ marginTop: "1rem", fontSize: "clamp(3rem, 8vw, 4.8rem)", lineHeight: 0.94, letterSpacing: "-0.045em", maxWidth: "36rem" }}>
          Private training software.
          <span style={{ color: "var(--color-text-dim)" }}> Built for clarity.</span>
        </div>
        <div style={{ marginTop: "0.9rem", color: "var(--color-text-dim)", lineHeight: 1.45 }}>
          Enter your Alpaca password to unlock your training archive, recording stack, and coaching notes.
        </div>
        <div className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-[22px] border px-4 py-4"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!password || submitting}
            className="w-full rounded-[22px] border px-4 py-4"
            style={{ borderColor: !password || submitting ? "var(--color-border)" : "rgba(90,230,222,0.28)", color: !password || submitting ? "var(--color-text-dim)" : "var(--color-accent)", opacity: 1, fontFamily: "var(--font-sharp)", letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.76rem" }}
          >
            {submitting ? "Unlocking" : "Unlock Alpaca"}
          </button>
        </div>
        {error ? <div style={{ marginTop: "0.95rem", color: "var(--color-text-soft)" }}>{error}</div> : null}
      </SurfaceCard>
    </div>
  );
}
