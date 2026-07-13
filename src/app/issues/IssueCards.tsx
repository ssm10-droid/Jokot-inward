"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resolveShortageAction,
  resolvePriceQueryAction,
  type ActionState,
} from "./actions";
import type { Bill } from "@/db/schema";

export function ShortageIssueCard({ bill }: { bill: Bill }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolutionType, setResolutionType] = useState<
    "debit_note" | "replacement_received" | null
  >(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ ok: true });

  function submit() {
    if (!resolutionType) return;
    startTransition(async () => {
      const result = await resolveShortageAction(bill.id, resolutionType, notes);
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{bill.id}</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {bill.grnCheckedDate
            ? new Date(bill.grnCheckedDate).toLocaleDateString("en-IN")
            : ""}
        </span>
      </div>
      <p className="muted" style={{ margin: "4px 0 10px" }}>
        {bill.vendorName}
      </p>
      {bill.vendorMessage && (
        <p style={{ fontSize: 14, margin: "0 0 10px", lineHeight: 1.4 }}>
          {bill.vendorMessage}
        </p>
      )}

      {!open ? (
        <button type="button" className="plain" onClick={() => setOpen(true)}>
          Resolve
        </button>
      ) : (
        <div>
          {!state.ok && state.error && (
            <p style={{ color: "#b3261e", fontSize: 14 }}>{state.error}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className={resolutionType === "debit_note" ? "primary" : "plain"}
              style={{ flex: 1 }}
              onClick={() => setResolutionType("debit_note")}
            >
              Debit Note
            </button>
            <button
              type="button"
              className={
                resolutionType === "replacement_received" ? "primary" : "plain"
              }
              style={{ flex: 1 }}
              onClick={() => setResolutionType("replacement_received")}
            >
              Replacement Received
            </button>
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            className="primary"
            disabled={pending || !resolutionType}
            onClick={submit}
          >
            {pending ? "Saving…" : "Confirm resolution"}
          </button>
        </div>
      )}
    </div>
  );
}

export function PriceQueryIssueCard({ bill }: { bill: Bill }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ ok: true });

  function submit() {
    startTransition(async () => {
      const result = await resolvePriceQueryAction(bill.id, notes);
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{bill.id}</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {bill.priceDate
            ? new Date(bill.priceDate).toLocaleDateString("en-IN")
            : ""}
        </span>
      </div>
      <p className="muted" style={{ margin: "4px 0 10px" }}>
        {bill.vendorName}
      </p>
      {bill.priceRemark && (
        <p style={{ fontSize: 14, margin: "0 0 10px", lineHeight: 1.4 }}>
          {bill.priceRemark}
        </p>
      )}

      {!open ? (
        <button type="button" className="plain" onClick={() => setOpen(true)}>
          Resolve
        </button>
      ) : (
        <div>
          {!state.ok && state.error && (
            <p style={{ color: "#b3261e", fontSize: 14 }}>{state.error}</p>
          )}
          <input
            placeholder="How was this resolved?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            className="primary"
            disabled={pending || !notes.trim()}
            onClick={submit}
          >
            {pending ? "Saving…" : "Confirm resolution"}
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "0 0 10px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 16,
  background: "#fff",
};
