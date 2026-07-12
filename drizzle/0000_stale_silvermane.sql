CREATE TYPE "public"."check_status" AS ENUM('pending', 'ok', 'short');--> statement-breakpoint
CREATE TYPE "public"."grn_status" AS ENUM('pending', 'ok', 'short');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('stock', 'expense');--> statement-breakpoint
CREATE TYPE "public"."price_status" AS ENUM('pending', 'approved', 'query');--> statement-breakpoint
CREATE TYPE "public"."rate_status" AS ENUM('pending', 'ok', 'discrepancy');--> statement-breakpoint
CREATE TYPE "public"."resolution_type" AS ENUM('debit_note', 'replacement_received');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('gate', 'store', 'purchase', 'accounts', 'partner');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bill_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"actor_email" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"item_name" text NOT NULL,
	"tally_stock_item" text,
	"qty_billed" numeric(14, 3) NOT NULL,
	"uom" text,
	"rate_billed" numeric(14, 2) NOT NULL,
	"check_status" "check_status" DEFAULT 'pending' NOT NULL,
	"actual_qty_received" numeric(14, 3),
	"grn_remarks" text,
	"rate_status" "rate_status" DEFAULT 'pending' NOT NULL,
	"correct_rate" numeric(14, 2),
	"rate_remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"security_seal_date" date,
	"security_serial_no" text,
	"bill_date" date,
	"bill_no" text,
	"vendor_name" text NOT NULL,
	"bill_photo_url" text,
	"physical_file_location" text,
	"gate_by" text NOT NULL,
	"gate_date" timestamp with time zone DEFAULT now() NOT NULL,
	"grn_no" text,
	"grn_status" "grn_status" DEFAULT 'pending' NOT NULL,
	"grn_by" text,
	"grn_checked_date" timestamp with time zone,
	"price_status" "price_status" DEFAULT 'pending' NOT NULL,
	"price_by" text,
	"price_date" timestamp with time zone,
	"price_remark" text,
	"issue_resolved_by" text,
	"issue_resolved_date" timestamp with time zone,
	"resolution_type" "resolution_type",
	"resolution_notes" text,
	"vendor_message" text,
	"tally_voucher_no" text,
	"accounts_posted_by" text,
	"accounts_posted_date" timestamp with time zone,
	"grn_note_file_url" text,
	"vendor_note_file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"name" text PRIMARY KEY NOT NULL,
	"tally_stock_item_name" text,
	"uom" text,
	"type" "item_type" DEFAULT 'stock' NOT NULL,
	"gst_pct" numeric(5, 2),
	"times_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_item_map" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_name" text NOT NULL,
	"item_name" text NOT NULL,
	"supplier_item_code" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"name" text PRIMARY KEY NOT NULL,
	"tally_ledger_name" text,
	"gstin" text,
	"default_purchase_ledger" text,
	"state" text,
	"bills_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_item_name_items_name_fk" FOREIGN KEY ("item_name") REFERENCES "public"."items"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_name_vendors_name_fk" FOREIGN KEY ("vendor_name") REFERENCES "public"."vendors"("name") ON DELETE no action ON UPDATE no action;