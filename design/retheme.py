"""One-shot palette swap: amber/ink -> green/gold/yellow/cream. Idempotent-unsafe; run once."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = r"C:\Users\USER\Projects\haul\landing"
FILES = ["index.html","intake.html","business.html","worker-signup.html","flyer.html",
         "terms.html","privacy.html","delete-account.html","surcharge-paid.html"]

# old -> new (matched case-insensitively, replaced with exact new string)
MAP = [
    ("rgba(26,23,20",   "rgba(35,53,39"),    # ink rgba -> forest rgba
    ("rgba(201,139,63", "rgba(201,162,60"),  # amber rgba -> gold rgba
    ("rgba(250,247,242","rgba(250,247,236"), # cream rgba
    ("rgba(242,238,231","rgba(240,239,226"), # cream-on-dark rgba
    ("C98B3F", "C9A23C"),  # amber -> gold
    ("8B5E2B", "7E6418"),  # amber-deep -> deep gold
    ("F5EDE0", "F3EED7"),  # amber-soft -> pale gold cream
    ("E8C48A", "E2C96B"),  # amber-mid -> yellow
    ("1A1714", "233527"),  # ink -> deep forest green
    ("534C44", "4C5847"),  # ink2 -> green-gray
    ("8B8379", "82897A"),  # ink3
    ("B8B0A4", "B2B5A3"),  # ink4
    ("FAF7F2", "FAF7EC"),  # bg cream -> beige cream
    ("F2EEE7", "F0EBD9"),  # surface -> beige
    ("4A8066", "3F7253"),  # success green -> richer green
    ("FDFAF3", "FCFAF0"),  # hero heading cream
    ("2b2620", "2A3328"),  # legal-page ink
    ("5c554c", "57604F"),  # legal ink2
    ("8a8178", "868D7C"),  # legal ink3
    ("e8e1d6", "E2DFC9"),  # legal line
    ("A06A28", "7E6418"),  # legal accent -> deep gold
    ("1A1209", "1F2C1D"),  # flyer ink -> forest
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
    # integrity: same length (all swaps are equal-length), html intact, no corruption marker
    ok = (len(t) == orig_len and "</html>" in t and "<html" in t and "rtml" not in t)
    if not ok:
        fail = True
        print(f"!! {f}: INTEGRITY FAIL (len {orig_len}->{len(t)}) — NOT WRITTEN")
        continue
    leftovers = [old for old, _ in MAP if re.search(re.escape(old), t, re.I)]
    if leftovers:
        print(f"!! {f}: leftovers {leftovers}")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(t)
    print(f"{f}: {' '.join(counts) if counts else 'no matches'}")

print("FAILED" if fail else "ALL OK")
