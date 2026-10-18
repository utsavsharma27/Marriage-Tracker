"""Export the wedding workbook tabs used by the tracker to CSV (values, not formulas).

Usage:  python3 scripts/export_csv.py path/to/Utsav_Marriage_Plan.xlsx
Writes CSVs into ../data/ so the site works offline / before Google Sheets is published.
"""
import csv, os, sys
import openpyxl

TABS = {
    "FINAL": "FINAL.csv",
    "Copy of Room Allocation1": "Copy-of-Room-Allocation1.csv",
    "works to do": "works-to-do.csv",
    "Advances": "Advances.csv",
    "summary": "summary.csv",
}

def clean(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip() if isinstance(v, str) else str(v)

def main(src):
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
    wb = openpyxl.load_workbook(src, data_only=True)   # cached formula results
    for tab, fname in TABS.items():
        ws = wb[tab]
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append([clean(v) for v in row])
        while rows and not any(rows[-1]):
            rows.pop()
        width = max(len(r) for r in rows)
        with open(os.path.join(out_dir, fname), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            for r in rows:
                w.writerow(r + [""] * (width - len(r)))
        print("wrote", fname, len(rows), "rows")

if __name__ == "__main__":
    main(sys.argv[1])
