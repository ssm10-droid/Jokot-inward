"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markItemCheckAction,
  confirmGrnAction,
  type ActionState,
} from "./actions";
import type { BillItem } from "@/db/schema";

interface RowState {
  id: string;
  itemName: string;
  qtyBilled: string;
  uom: string | null;
  checkStatus: "pending" | "ok" | "short";
  actualQtyReceived: string;
  grnRemarks: string;
  saved: boolean;
}

export function GrnChecker({
  billId,
  items,
}: {
  billId: string;
  items: BillItem[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(
    items.map((it) => ({
      id: it.id,
      itemName: it.itemName,
      qtyBilled: String(it.qtyBilled),
      uom: it.uom,
      checkStatus: it.checkStatus,
      actualQtyReceived: it.actualQtyReceived ? String(it.actualQtyReceived) : "",
      grnRemarks: it.grnRemarks ?? "",
      saved: it.checkStatus !== "pending",
    }))
  );
  const [pending, startTransition] = useTransition();
  const [confirmState, setConfirmState] = useState<ActionState>({ ok: true });

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function markOk(id: string) {
    setRow(id, { checkStatus: "ok", saved: false });
    startTransition(async () => {
      await markItemCheckAction(billId, id, "ok", null, null);
      setRow(id, { saved: true });
      router.refresh();
    });
  }

  function markShort(id: string) {
    setRow(id, { checkStatus: "short", saved: false });
  }

  function saveShort(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    startTransition(async () => {
      await markItemCheckAction(
        billId,
        id,
        "short",
        row.actualQtyReceived || null,
        row.grnRemarks || null
      );
      setRow(id, { saved: true });
      router.refresh();
    });
  }

  const allChecked = rows.every((r) => r.checkStatus !== "pending");
  const shortIncomplete = rows.some(
    (r) =>
      r.checkStatus === "short" &&
      (!r.actualQtyReceived || !r.grnRemarks.trim() || !r.saved)
  );

  function confirm() {
    startTransition(async () => {
      const result = await confirmGrnAction(billId);
      // confirmGrnAction redirects on success, so we only reach here on error
      if (result) setConfirmState(result);
    });
  }

  return (
    <div>
      {rows.map((row) => (
        <div key={row.id} className="card" style={rowCardStyle(row)}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{row.itemName}</strong>
            <span className="muted">
              billed {row.qtyBilled} {row.uom ?? ""}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className={row.checkStatus === "ok" ? "primary" : "plain"}
              onClick={() => markOk(row.id)}
              disabled={pending}
              style={{ flex: 1 }}
            >
              OK
            </button>
            <button
              type="button"
              className={row.checkStatus === "short" ? "shortActive" : "plain"}
              onClick={() => markShort(row.id)}
              disabled={pending}
              style={{ flex: 1 }}
            >
              Short
            </button>
          </div>

          {row.checkStatus === "short" && (
            <div style={{ marginTop: 10 }}>
              <input
                placeholder={`Received qty (${row.uom ?? ""})`}
                inputMode="decimal"
                value={row.actualQtyReceived}
                onChange={(e) =>
                  setRow(row.id, {
                    actualQtyReceived: e.target.value,
                    saved: false,
                  })
                }
                style={inputStyle}
              />
              <input
                placeholder="Reason for shortage"
                value={row.grnRemarks}
                onChange={(e) =>
                  setRow(row.id, { grnRemarks: e.target.value, saved: false })
                }
                style={inputStyle}
              />
              <button
                type="button"
                className="plain"
                onClick={() => saveShort(row.id)}
                disabled={pending || !row.actualQtyReceived || !row.grnRemarks.trim()}
              >
                {row.saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          )}
        </div>
      ))}

      {!confirmState.ok && confirmState.error && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>{confirmState.error}</p>
        </div>
      )}

      {!allChecked && (
        <p className="muted" style={{ textAlign: "center" }}>
          Mark every item before confirming.
        </p>
      )}
      {allChecked && shortIncomplete && (
        <p className="muted" style={{ textAlign: "center", color: "#b3261e" }}>
          Save the received qty and reason for every short item.
        </p>
      )}

      <button
        className="primary"
        style={{ width: "100%", marginTop: 8 }}
        disabled={pending || !allChecked || shortIncomplete}
        onClick={confirm}
      >
        {pending ? "Confirming…" : "Confirm GRN"}
      </button>

      <style jsx global>{`
        .shortActive {
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
  if (row.checkStatus === "ok") return { borderColor: "var(--accent)" };
  if (row.checkStatus === "short") return { borderColor: "#b3261e" };
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
