# Generates a branded one-pager of Fast Fix Work's CURRENT pricing (fpdf2).
from fpdf import FPDF

AMBER = (201, 139, 63)       # #C98B3F
AMBER_DEEP = (139, 94, 43)   # #8B5E2B
INK = (26, 23, 20)
INK2 = (83, 76, 68)
SOFT = (245, 237, 224)       # amber-soft
LINE = (220, 210, 196)

class PDF(FPDF):
    def header(self):
        self.set_fill_color(*AMBER)
        self.rect(0, 0, 210, 26, "F")
        self.set_xy(12, 7)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 18)
        self.cell(0, 8, "Fast Fix Work - Pricing Breakdown", new_x="LMARGIN", new_y="NEXT")
        self.set_xy(12, 16)
        self.set_font("Helvetica", "", 9)
        self.cell(0, 5, "Austin, TX moving & labor  |  Current as of June 2, 2026", new_x="LMARGIN", new_y="NEXT")
        self.ln(14)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 5, "Fast Fix Work LLC  -  fastfixwork.com  -  512-777-1628  -  Prices in USD. Estimate subject to change based on actual move conditions.", align="C")

def section(pdf, title):
    pdf.ln(2)
    pdf.set_text_color(*AMBER_DEEP)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*LINE)
    y = pdf.get_y()
    pdf.line(12, y, 198, y)
    pdf.ln(2)

def kv_table(pdf, rows, c1=120, c2=60):
    pdf.set_font("Helvetica", "", 10)
    for i, (k, v) in enumerate(rows):
        pdf.set_text_color(*INK2)
        if i % 2 == 0:
            pdf.set_fill_color(250, 247, 242)
            fill = True
        else:
            fill = False
        pdf.cell(c1, 7, "  " + k, border=0, fill=fill)
        pdf.set_text_color(*INK)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(c2, 7, v + "  ", border=0, align="R", fill=fill, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)

pdf = PDF()
pdf.set_auto_page_break(True, margin=18)
pdf.set_margins(12, 26, 12)
pdf.add_page()

# Base prices
section(pdf, "Base price by move size")
kv_table(pdf, [
    ("Single item", "$93.75"),
    ("Just a few items", "$175"),
    ("Studio", "$350"),
    ("1 Bedroom", "$500"),
    ("2 Bedroom", "$800"),
    ("3 Bedroom", "$1,350"),
    ("4+ BR / full house", "$1,600"),
])
pdf.set_font("Helvetica", "I", 8)
pdf.set_text_color(*INK2)
pdf.multi_cell(0, 4.5, "Crew size and truck size are collected for crew planning but do NOT change the flat quote.", new_x="LMARGIN", new_y="NEXT")

# Surcharges
section(pdf, "Surcharges (added to base)")
kv_table(pdf, [
    ("Stairs", "$50 per flight (each location)"),
    ("Elevator", "$40 per location with an elevator"),
    ("Long carry (100+ ft from door)", "$50"),
    ("Distance", "$1.25 / mile over 15 free miles"),
    ("Long distance (50+ mi, or chosen)", "+50% of base"),
    ("Home staging (arrange/style furniture)", "+30% of base"),
    ("Packing service (boxes + labor)", "+25% of base"),
    ("Bed frame disassembly", "$50"),
    ("Shelving disassembly", "$25"),
])

# Special items
section(pdf, "Special / heavy items (each)")
kv_table(pdf, [
    ("Piano", "$250"),
    ("Pool table", "$300"),
    ("Safe / gun safe", "$150"),
    ("Refrigerator", "$120"),
    ("Refrigerator disassembly", "+$80"),
    ("Treadmill / Peloton", "$75"),
    ('Big TV (65"+)', "$75"),
    ("Aquarium", "$75"),
    ("Artwork / mirror", "$75"),
    ("Other heavy / specialty item", "$75"),
])

# Tax + payment
section(pdf, "Tax & payment terms")
kv_table(pdf, [
    ("Sales tax (Texas)", "8.25%"),
    ("Payment", "100% upfront at booking"),
    ("Platform service fee", "15%"),
    ("Mover payout (after job)", "85%"),
    ("Refund", "80% if cancelled 48+ hrs out; none within 48 hrs"),
])
pdf.set_font("Helvetica", "I", 8)
pdf.set_text_color(*INK2)
pdf.multi_cell(0, 4.5, "If the on-site job is larger than what was described at booking, an additional charge may apply (billed via a secure payment link).", new_x="LMARGIN", new_y="NEXT")

# Worked example
section(pdf, "Example: 2 BR, 3 flights of stairs, elevator at drop-off, a piano (local)")
pdf.set_fill_color(*SOFT)
pdf.set_draw_color(*AMBER)
ex_y = pdf.get_y()
rows = [
    ("Base move (2 BR)", "$800.00"),
    ("Stairs (3 flights x $50)", "$150.00"),
    ("Elevator (1 location)", "$40.00"),
    ("Piano", "$250.00"),
    ("Subtotal", "$1,240.00"),
    ("Tax (8.25%)", "$102.30"),
]
pdf.set_font("Helvetica", "", 10)
for k, v in rows:
    bold = k in ("Subtotal",)
    pdf.set_font("Helvetica", "B" if bold else "", 10)
    pdf.set_text_color(*INK2)
    pdf.cell(130, 6.5, "   " + k, border=0)
    pdf.set_text_color(*INK)
    pdf.cell(56, 6.5, v + "   ", border=0, align="R", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "B", 11)
pdf.set_text_color(*AMBER_DEEP)
pdf.cell(130, 8, "   TOTAL", border=0)
pdf.cell(56, 8, "$1,342.30   ", border=0, align="R", new_x="LMARGIN", new_y="NEXT")

out = r"C:\Users\USER\Downloads\fast-fix-work-pricing.pdf"
pdf.output(out)
print("WROTE", out)
