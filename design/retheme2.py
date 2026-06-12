"""Round 2: desaturate the green — forest ink -> near-black charcoal with a
hint of green. Gold/cream untouched. Equal-length case-insensitive swaps."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = r"C:\Users\USER\Projects\haul\landing"
FILES = ["index.html","intake.html","business.html","worker-signup.html","flyer.html",
         "terms.html","privacy.html","delete-account.html","surcharge-paid.html"]

MAP = [
    ("rgba(35,53,39", "rgba(33,37,31"),  # ink rgba -> charcoal rgba
    ("233527", "21251F"),  # ink: forest -> charcoal w/ green hint
    ("4C5847", "4D5149"),  # ink2
    ("82897A", "84877E"),  # ink3
    ("B2B5A3", "B2B4AB"),  # ink4
    ("2A3328", "24271F"),  # legal ink
    ("57604F", "53564D"),  # legal ink2
    ("868D7C", "87897F"),  # legal ink3
    ("1F2C1D", "21251F"),  # flyer ink
]

fail = False
for f in FILES:
    p = f"{BASE}\\{f}"
    with open(p, encoding="utf-8") as fh:
        t = fh.read()
    orig_len = len(t)
    counts = []
    for old, new in MAP:
        n = len(re.findall(re.escape(old), t, re.I))
        if n:
            t = re.sub(re.escape(old), new, t, flags=re.I)
            counts.append(f"{old}x{n}")
    ok = (len(t) == orig_len and "</html>" in t and "<html" in t and "rtml" not in t)
    if not ok:
        fail = True
        print(f"!! {f}: INTEGRITY FAIL — NOT WRITTEN")
        continue
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)
    print(f"{f}: {' '.join(counts) if counts else 'no matches'}")

print("FAILED" if fail else "ALL OK")
