"use client";

import { useActionState } from "react";
import { postToTallyAction, type ActionState } from "./actions";

export function PostToTallyForm({ billId }: { billId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    postToTallyAction,
    { ok: true }
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="billId" value={billId} />

      {!state.ok && state.error && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>{state.error}</p>
        </div>
      )}

      <div className="card">
        <p className="muted" style={{ margin: "0 0 6px" }}>
          Tally voucher number
        </p>
        <input
          name="voucherNo"
          required
          style={inputStyle}
          placeholder="e.g. PV/2026/0142"
          autoComplete="off"
        />
        <button className="primary" type="submit" disabled={pending} style={{ width: "100%" }}>
          {pending ? "Posting…" : "Post to Tally"}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "0 0 12px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 16,
  background: "#fff",
};
