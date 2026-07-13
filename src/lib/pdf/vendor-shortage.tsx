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
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },
  para: { marginTop: 14, lineHeight: 1.5 },
  footer: { marginTop: 28 },
  footerLabel: { color: "#555", marginBottom: 20 },
  footerLine: { borderTop: "1 solid #000", paddingTop: 3, fontSize: 9, width: 220 },
});

export function VendorShortageDocument({
  bill,
  items,
}: {
  bill: Bill;
  items: BillItem[];
}) {
  const shortItems = items.filter((i) => i.checkStatus === "short");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Vendor Shortage Note</Text>
        <Text style={styles.subtitle}>Jokot International — Stores</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Vendor</Text>
          <Text style={styles.metaValue}>{bill.vendorName}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bill No.</Text>
          <Text style={styles.metaValue}>
            {bill.billNo ?? bill.id} ({bill.id})
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bill Date</Text>
          <Text style={styles.metaValue}>{bill.billDate ?? "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date Noted</Text>
          <Text style={styles.metaValue}>
            {bill.grnCheckedDate
              ? new Date(bill.grnCheckedDate).toLocaleDateString("en-IN")
              : new Date().toLocaleDateString("en-IN")}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lines received short</Text>
          {shortItems.map((it) => (
            <View style={styles.bullet} key={it.id}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>
                {it.itemName} — billed {it.qtyBilled} {it.uom ?? ""}, received{" "}
                {it.actualQtyReceived ?? "—"} {it.uom ?? ""}
                {it.grnRemarks ? ` (${it.grnRemarks})` : ""}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.para}>
          Kindly arrange replacement or issue a credit note for the shortage
          listed above. Please contact us to confirm the resolution.
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Store Incharge</Text>
          <Text style={styles.footerLine}>
            {bill.grnBy ?? ""}
            {bill.grnCheckedDate
              ? `  —  ${new Date(bill.grnCheckedDate).toLocaleString("en-IN")}`
              : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
