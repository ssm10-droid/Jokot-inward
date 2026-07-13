"use client";

import { useState, useActionState, useTransition } from "react";
import { createBillAction, getItemOptionsAction, type ItemOption } from "./actions";

interface LineItemRow {
  key: string;
  itemName: string;
  qtyBilled: string;
  rateBilled: string;
}

function newRow(): LineItemRow {
  return {
    key: Math.random().toString(36).slice(2),
    itemName: "",
    qtyBilled: "",
    rateBilled: "",
  };
}

export function NewBillForm({
  vendorNames,
  initialItems,
}: {
  vendorNames: string[];
  initialItems: ItemOption[];
}) {
  const [vendorName, setVendorName] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>(initialItems);
  const [rows, setRows] = useState<LineItemRow[]>([newRow()]);
  const [, startTransition] = useTransition();

  const [state, formAction, pending] = useActionState(createBillAction, {
    ok: true,
  });

  function onVendorBlur() {
    if (!vendorName.trim()) return;
    startTransition(async () => {
      const opts = await getItemOptionsAction(vendorName.trim());
      setItemOptions(opts);
    });
  }

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  const itemsJson = JSON.stringify(
    rows
      .filter((r) => r.itemName && r.qtyBilled && r.rateBilled)
      .map((r) => ({
        itemName: r.itemName,
        qtyBilled: Number(r.qtyBilled),
        rateBilled: Number(r.rateBilled),
      }))
  );

  const total = rows.reduce((sum, r) => {
    const q = Number(r.qtyBilled) || 0;
    const rate = Number(r.rateBilled) || 0;
    return sum + q * rate;
  }, 0);

  return (
    <form action={formAction}>
      <input type="hidden" name="itemsJson" value={itemsJson} />

      {!state.ok && state.error && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>{state.error}</p>
        </div>
      )}

      <div className="card">
        <p className="sectionLabel">Bill photo</p>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
        />

        <p className="sectionLabel" style={{ marginTop: 20 }}>
          Vendor
        </p>
        <input
          name="vendorName"
          list="vendor-list"
          required
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          onBlur={onVendorBlur}
          style={inputStyle}
          placeholder="Start typing vendor name…"
          autoComplete="off"
        />
        <datalist id="vendor-list">
          {vendorNames.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <div className="grid2">
          <div>
            <p className="sectionLabel">Bill No. (vendor's)</p>
            <input name="billNo" style={inputStyle} />
          </div>
          <div>
            <p className="sectionLabel">Bill date</p>
            <input name="billDate" type="date" style={inputStyle} />
          </div>
        </div>

        <div className="grid2">
          <div>
            <p className="sectionLabel">Security seal date</p>
            <input name="securitySealDate" type="date" style={inputStyle} />
          </div>
          <div>
            <p className="sectionLabel">Security serial no.</p>
            <input name="securitySerialNo" style={inputStyle} />
          </div>
        </div>

        <p className="sectionLabel">Physical file location</p>
        <input name="physicalFileLocation" style={inputStyle} />
      </div>

      <div className="card">
        <p className="sectionLabel" style={{ marginBottom: 12 }}>
          Items
        </p>

        <datalist id="item-list">
          {itemOptions.map((i) => (
            <option key={i.name} value={i.name} />
          ))}
        </datalist>

        {rows.map((row, idx) => (
          <div key={row.key} className="itemRow">
            <div className="itemRowHeader">
              <span className="muted">Item {idx + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="linkBtn"
                  onClick={() => removeRow(row.key)}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              list="item-list"
              placeholder="Item name…"
              value={row.itemName}
              onChange={(e) => updateRow(row.key, { itemName: e.target.value })}
              style={inputStyle}
              autoComplete="off"
            />
            <div className="grid2">
              <input
                placeholder="Qty"
                inputMode="decimal"
                value={row.qtyBilled}
                onChange={(e) =>
                  updateRow(row.key, { qtyBilled: e.target.value })
                }
                style={inputStyle}
              />
              <input
                placeholder="Rate"
                inputMode="decimal"
                value={row.rateBilled}
                onChange={(e) =>
                  updateRow(row.key, { rateBilled: e.target.value })
                }
                style={inputStyle}
              />
            </div>
          </div>
        ))}

        <button type="button" className="plain" onClick={addRow}>
          + Add item
        </button>

        <p className="muted" style={{ marginTop: 16, textAlign: "right" }}>
          Total: ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </p>
      </div>

      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save bill"}
      </button>

      <style jsx>{`
        .sectionLabel {
          font-size: 13px;
          color: var(--muted);
          margin: 0 0 6px;
        }
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .itemRow {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .itemRowHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .linkBtn {
          background: none;
          border: none;
          color: #b3261e;
          font-size: 13px;
          padding: 0;
        }
      `}</style>
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
