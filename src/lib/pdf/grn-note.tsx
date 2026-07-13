import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Bill, BillItem } from "@/db/schema";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 130, color: "#555" },
  metaValue: { flex: 1, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 16, marginBottom: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    borderBottom: "1 solid #ccc",
    paddingBottom: 3,
  },
  table: { display: "flex", width: "100%" },
  tr: { flexDirection: "row", borderBottom: "0.5 solid #ddd" },
  thRow: {
    flexDirection: "row",
    borderBottom: "1 solid #000",
    paddingBottom: 4,
    marginBottom: 2,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  td: { fontSize: 9, paddingVertical: 3 },
  colItem: { flex: 3 },
  colQty: { flex: 1.3, textAlign: "right" },
  colResult: { flex: 1.4, textAlign: "center" },
  colRemarks: { flex: 2.3 },
  ok: { color: "#0f4c3a" },
  short: { color: "#b3261e" },
  footer: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerBox: { width: "45%" },
  footerLabel: { color: "#555", marginBottom: 20 },
  footerLine: { borderTop: "1 solid #000", paddingTop: 3, fontSize: 9 },
});

export function GrnNoteDocument({
  bill,
  items,
}: {
  bill: Bill;
  items: BillItem[];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>GRN Note</Text>
        <Text style={styles.subtitle}>Jokot International</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bill No.</Text>
          <Text style={styles.metaValue}>{bill.id}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>GRN No.</Text>
          <Text style={styles.metaValue}>{bill.grnNo ?? "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Vendor</Text>
          <Text style={styles.metaValue}>{bill.vendorName}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Vendor Bill No.</Text>
          <Text style={styles.metaValue}>{bill.billNo ?? "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bill Date</Text>
          <Text style={styles.metaValue}>{bill.billDate ?? "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Result</Text>
          <Text
            style={[
              styles.metaValue,
              bill.grnStatus === "short" ? styles.short : styles.ok,
            ]}
          >
            {bill.grnStatus === "short" ? "SHORT RECEIVED" : "RECEIVED OK"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, styles.colItem]}>Item</Text>
              <Text style={[styles.th, styles.colQty]}>Billed Qty</Text>
              <Text style={[styles.th, styles.colQty]}>Received Qty</Text>
              <Text style={[styles.th, styles.colResult]}>Result</Text>
              <Text style={[styles.th, styles.colRemarks]}>Remarks</Text>
            </View>
            {items.map((it) => (
              <View style={styles.tr} key={it.id}>
                <Text style={[styles.td, styles.colItem]}>{it.itemName}</Text>
                <Text style={[styles.td, styles.colQty]}>
                  {it.qtyBilled} {it.uom ?? ""}
                </Text>
                <Text style={[styles.td, styles.colQty]}>
                  {it.checkStatus === "short"
                    ? `${it.actualQtyReceived ?? "—"} ${it.uom ?? ""}`
                    : `${it.qtyBilled} ${it.uom ?? ""}`}
                </Text>
                <Text
                  style={[
                    styles.td,
                    styles.colResult,
                    it.checkStatus === "short" ? styles.short : styles.ok,
                  ]}
                >
                  {it.checkStatus === "short" ? "SHORT" : "OK"}
                </Text>
                <Text style={[styles.td, styles.colRemarks]}>
                  {it.checkStatus === "short" ? it.grnRemarks ?? "" : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBox}>
            <Text style={styles.footerLabel}>Checked by</Text>
            <Text style={styles.footerLine}>
              {bill.grnBy ?? ""}
              {bill.grnCheckedDate
                ? `  —  ${new Date(bill.grnCheckedDate).toLocaleString(
                    "en-IN"
                  )}`
                : ""}
            </Text>
          </View>
          <View style={styles.footerBox}>
            <Text style={styles.footerLabel}>Store Incharge Signature</Text>
            <Text style={styles.footerLine}> </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
