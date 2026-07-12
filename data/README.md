# Seed data

Replace these files with real exports from the AppSheet Google Sheet
(File -> Download -> CSV, one per sheet). Headers must match:

- `vendors.csv` — name, tally_ledger_name, gstin, default_purchase_ledger, state
- `items.csv` — name, tally_stock_item_name, uom, type, gst_pct
- `supplier_item_map.csv` — supplier_name, item_name, supplier_item_code, is_active
- `users.csv` — email, name, role  (roles: gate, store, purchase, accounts, partner)

`users.csv` here is a placeholder — put in the real Google account emails
before seeding, since only listed emails can sign in at all.
