"use client";

import { useState, useTransition } from "react";
import {
  markItemRateAction,
  approveRatesAction,
  raiseQueryAction,
  type ActionState,
} from "./actions";
import type { BillItem } from "@/db/schema";

interface RowState {
  id: string;
  itemName: string;
  rateBilled: string;
  rateStatus: "pending" | "ok" | "discrepancy";
  correctRate: string;
  rateRemarks: string;
  saved: boolean;
}

export function PriceChecker({
  billId,
  items,
}: {
  billId: string;
  items: BillItem[];
}) {
  const [rows, setRows] = useState<RowState[]>(
    items.map((it) => ({
      id: it.id,
      itemName: it.itemName,
      rateBilled: String(it.rateBilled),
      rateStatus: it.rateStatus,
      correctRate: it.correctRate ? String(it.correctRate) : "",
      rateRemarks: it.rateRemarks ?? "",
      saved: it.rateStatus !== "pending",
    }))
  );
  const [pending, startTransition] = useTransition();
  const [approveState, setApproveState] = useState<ActionState>({ ok: true });
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queryState, setQueryState] = useState<ActionState>({ ok: true });

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function markOk(id: string) {
    setRow(id, { rateStatus: "ok", saved: false });
    startTransition(async () => {
      await markItemRateAction(billId, id, "ok", null, null);
      setRow(id, { saved: true });
    });
  }

  function markDiscrepancy(id: string) {
    setRow(id, { rateStatus: "discrepancy", saved: false });
  }

  function saveDiscrepancy(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    startTransition(async () => {
      await markItemRateAction(
        billId,
        id,
        "discrepancy",
        row.correctRate || null,
        row.rateRemarks || null
      );
      setRow(id, { saved: true });
    });
  }

  const allChecked = rows.every((r) => r.rateStatus !== "pending");
  const discrepancyIncomplete = rows.some(
    (r) =>
      r.rateStatus === "discrepancy" &&
      (!r.correctRate || !r.saved)
  );

  function approve() {
    startTransition(async () => {
      const result = await approveRatesAction(billId);
      if (result) setApproveState(result);
    });
  }

  function submitQuery() {
    startTransition(async () => {
      const result = await raiseQueryAction(billId, queryText);
      if (result) setQueryState(result);
    });
  }

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id} className="card" style={rowCardStyle(row)}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{row.itemName}</strong>
            <span className="muted">billed ₹{row.rateBilled}</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className={row.rateStatus === "ok" ? "primary" : "plain"}
              onClick={() => markOk(row.id)}
              disabled={pending}
              style={{ flex: 1 }}
            >
              OK
            </button>
            <button
              type="button"
              className={row.rateStatus === "discrepancy" ? "discActive" : "plain"}
              onClick={() => markDiscrepancy(row.id)}
              disabled={pending}
              style={{ flex: 1 }}
            >
              Discrepancy
            </button>
          </div>

          {row.rateStatus === "discrepancy" && (
            <div style={{ marginTop: 10 }}>
              <input
                placeholder="Correct rate"
                inputMode="decimal"
                value={row.correctRate}
                onChange={(e) =>
                  setRow(row.id, { correctRate: e.target.value, saved: false })
                }
                style={inputStyle}
              />
              <input
                placeholder="Remarks (optional)"
                value={row.rateRemarks}
                onChange={(e) =>
                  setRow(row.id, { rateRemarks: e.target.value, saved: false })
                }
                style={inputStyle}
              />
              <button
                type="button"
                className="plain"
                onClick={() => saveDiscrepancy(row.id)}
                disabled={pending || !row.correctRate}
              >
                {row.saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          )}
        </div>
      ))}

      {!approveState.ok && approveState.error && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>{approveState.error}</p>
        </div>
      )}

      {!allChecked && (
        <p className="muted" style={{ textAlign: "center" }}>
          Mark every item before approving.
        </p>
      )}
      {allChecked && discrepancyIncomplete && (
        <p className="muted" style={{ textAlign: "center", color: "#b3261e" }}>
          Save the correct rate for every discrepancy.
        </p>
      )}

      <button
        className="primary"
        style={{ width: "100%", marginTop: 8 }}
        disabled={pending || !allChecked || discrepancyIncomplete}
        onClick={approve}
      >
        {pending ? "Working…" : "Approve Rates"}
      </button>

      <div className="card" style={{ marginTop: 20 }}>
        {!queryOpen ? (
          <button type="button" className="plain" onClick={() => setQueryOpen(true)}>
            Raise a general query instead
          </button>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              Use this for a bill-level issue that isn't about one item's
              rate — e.g. the invoice total doesn't match the PO.
            </p>
            {!queryState.ok && queryState.error && (
              <p style={{ color: "#b3261e", fontSize: 14 }}>{queryState.error}</p>
            )}
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Describe the issue…"
            />
            <button
              type="button"
              className="primary"
              disabled={pending || !queryText.trim()}
              onClick={submitQuery}
            >
              {pending ? "Raising…" : "Raise Query"}
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        .discActive {
          background: #b3261e;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 15px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function rowCardStyle(row: RowState): React.CSSProperties {
  if (row.rateStatus === "ok") return { borderColor: "var(--accent)" };
  if (row.rateStatus === "discrepancy") return { borderColor: "#b3261e" };
  return {};
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "0 0 8px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 16,
  background: "#fff",
};
