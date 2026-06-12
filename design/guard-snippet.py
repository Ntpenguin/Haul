"""Add an https-only guard to the .html->extensionless bounce snippet so it
never fires on file:// (folder double-click) or localhost."""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

OLD = "<script>if(/\\.html$/.test(location.pathname))location.replace("
NEW = "<script>if(location.protocol==='https:'&&/\\.html$/.test(location.pathname))location.replace("

files = [r"C:\Users\USER\Projects\haul\admin\index.html"] + [
    rf"C:\Users\USER\Projects\haul\landing\{f}"
    for f in ["index.html", "intake.html", "business.html", "worker-signup.html",
              "flyer.html", "terms.html", "privacy.html", "delete-account.html",
              "surcharge-paid.html"]
]
for p in files:
    t = open(p, encoding="utf-8").read()
    n = t.count(OLD)
    assert n == 1, f"{p}: expected 1 occurrence, found {n}"
    t2 = t.replace(OLD, NEW)
    assert len(t2) == len(t) + len(NEW) - len(OLD) and "</html>" in t2
    open(p, "w", encoding="utf-8", newline="").write(t2)
    print(p.split("\\")[-2] + "/" + p.split("\\")[-1], "patched")
print("ALL OK")
