"use client";

import { useEffect, useRef, useState, useActionState, useTransition } from "react";
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

  // Photo selection (camera or file/scan) with preview
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoIsPdf, setPhotoIsPdf] = useState(false);

  function onPhotoChosen(which: "camera" | "file") {
    const input = which === "camera" ? cameraRef.current : fileRef.current;
    const other = which === "camera" ? fileRef.current : cameraRef.current;
    const f = input?.files?.[0];
    if (!f) return;
    if (other) other.value = "";
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    const isPdf = f.type === "application/pdf";
    setPhotoIsPdf(isPdf);
    setPhotoPreview(isPdf ? null : URL.createObjectURL(f));
    setPhotoName(f.name);
  }

  function clearPhoto() {
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoName(null);
    setPhotoIsPdf(false);
  }

  // After "Save & next bill" succeeds, reset everything for the next entry
  const [formKey, setFormKey] = useState(0);
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.ok && state.savedBillId && state.savedBillId !== lastSavedRef.current) {
      lastSavedRef.current = state.savedBillId;
      setVendorName("");
      setRows([newRow()]);
      setItemOptions(initialItems);
      setPhotoPreview(null);
      setPhotoName(null);
      setPhotoIsPdf(false);
      setFormKey((k) => k + 1); // remount form -> clears uncontrolled inputs
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state, initialItems]);

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
    <form action={formAction} key={formKey}>
      <input type="hidden" name="itemsJson" value={itemsJson} />

      {state.ok && state.savedBillId && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <p style={{ margin: 0 }}>
            ✓ Bill <strong>{state.savedBillId}</strong> saved. Enter the next
            bill below.
          </p>
        </div>
      )}

      {!state.ok && state.error && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>{state.error}</p>
        </div>
      )}

      <div className="card">
        <p className="sectionLabel">Bill photo</p>
        <input
          ref={cameraRef}
          type="file"
          name="photoCamera"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={() => onPhotoChosen("camera")}
        />
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={() => onPhotoChosen("file")}
        />
        <div className="grid2">
          <button
            type="button"
            className="plain"
            onClick={() => cameraRef.current?.click()}
          >
            📷 Take photo
          </button>
          <button
            type="button"
            className="plain"
            onClick={() => fileRef.current?.click()}
          >
            📁 Choose file / scan
          </button>
        </div>
        {(photoPreview || photoIsPdf) && (
          <div style={{ marginTop: 12 }}>
            {photoIsPdf ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "#fff",
                }}
              >
                <span style={{ fontSize: 22 }}>📄</span>
                <span style={{ fontSize: 14, wordBreak: "break-all" }}>
                  {photoName}
                </span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview!}
                alt="Bill photo preview"
                style={{
                  width: "100%",
                  maxHeight: 320,
                  objectFit: "contain",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "#fff",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                {photoIsPdf ? "PDF attached" : `${photoName} — check it's readable`}
              </span>
              <button type="button" className="linkBtn" onClick={clearPhoto}>
                Remove
              </button>
            </div>
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
          For a clearer copy than a plain photo: on a phone, tap{" "}
          <strong>Choose file / scan</strong> → Browse/Files →{" "}
          <strong>Scan Documents</strong> — this uses the built-in scanner
          that auto-crops and straightens the page. On a computer connected
          to a printer/scanner, scan the bill first (saved as JPG, PNG, or
          PDF), then tap <strong>Choose file / scan</strong> to attach that
          file.
        </p>

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

      <div className="grid2" style={{ marginTop: 4 }}>
        <button
          className="primary"
          type="submit"
          name="saveMode"
          value="next"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save & next bill"}
        </button>
        <button
          className="primary"
          type="submit"
          name="saveMode"
          value="close"
          disabled={pending}
          style={{ background: "#fff", color: "var(--accent)", border: "1px solid var(--accent)" }}
        >
          {pending ? "Saving…" : "Save & close"}
        </button>
      </div>

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
