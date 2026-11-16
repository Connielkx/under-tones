"""Make the print-quality QR code for the published UNDER-tones site.
usage:  python3 make_qr.py https://connielkx.github.io/under-tones/
writes (in qr/):
  UNDER-tones_QR.svg / .pdf                vector, one merged path (no hairline seams), for InDesign
  UNDER-tones_QR.png                       6000 x 6000 px, pure black on white, 600 dpi tag
  UNDER-tones_QR_labelled.svg / .pdf / .png  same code with "SCAN TO LISTEN: UNDER-TONES" and the short address
Error correction is level H (about 30% of the code can be damaged or covered and it still scans).
PDF and labelled PNG need rsvg-convert. Every raster output is decoded back to verify it."""
import sys, os, subprocess, cv2, numpy as np
url = sys.argv[1]; os.makedirs("qr", exist_ok=True)
p = cv2.QRCodeEncoder_Params(); p.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_H
m = cv2.QRCodeEncoder.create(p).encode(url)                     # one px per module, no quiet zone
mods = (m < 128); n = mods.shape[0]; qz = 4; N = n + 2 * qz
# one path made of horizontal runs: no seams between neighbouring modules
d = []
for y in range(n):
    x = 0
    while x < n:
        if mods[y, x]:
            s = x
            while x < n and mods[y, x]: x += 1
            d.append(f"M{s + qz} {y + qz}h{x - s}v1h-{x - s}z")
        else:
            x += 1
path = f'<path fill="#000000" d="{"".join(d)}"/>'
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" width="40mm" height="40mm" shape-rendering="crispEdges">'
       f'<rect width="{N}" height="{N}" fill="#FFFFFF"/>{path}</svg>')
open("qr/UNDER-tones_QR.svg", "w").write(svg)
px = 6000 // N; S = N * px; img = np.full((S, S), 255, np.uint8)
for y, x in zip(*np.nonzero(mods)): img[(y + qz) * px:(y + qz + 1) * px, (x + qz) * px:(x + qz + 1) * px] = 0
cv2.imwrite("qr/UNDER-tones_QR.png", img)
short = url.replace("https://", "").rstrip("/")
H = N + 14
lab = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {H}" width="40mm" height="{40 * H / N:.2f}mm">'
       f'<rect width="{N}" height="{H}" fill="#FFFFFF"/><g shape-rendering="crispEdges">{path}</g>'
       f'<text x="{N/2}" y="{N + 4.2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="{N/21:.2f}" font-weight="700" letter-spacing="0.12" fill="#000000">SCAN TO LISTEN: UNDER-TONES</text>'
       f'<text x="{N/2}" y="{N + 8.6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="{N/19.5:.2f}" fill="#555555">{short}</text></svg>')
open("qr/UNDER-tones_QR_labelled.svg", "w").write(lab)
for name in ("UNDER-tones_QR", "UNDER-tones_QR_labelled"):
    subprocess.run(["rsvg-convert", "-f", "pdf", f"qr/{name}.svg", "-o", f"qr/{name}.pdf"], check=True)
subprocess.run(["rsvg-convert", "-w", str(S), "-b", "white", "qr/UNDER-tones_QR_labelled.svg", "-o", "qr/UNDER-tones_QR_labelled.png"], check=True)
det = cv2.QRCodeDetector()
for f in ("UNDER-tones_QR.png", "UNDER-tones_QR_labelled.png"):
    im = cv2.imread(f"qr/{f}", 0); small = cv2.resize(im, (im.shape[1] // 6, im.shape[0] // 6), interpolation=cv2.INTER_AREA)
    print(f, im.shape[::-1], "decodes:", det.detectAndDecode(small)[0] == url)
print("modules:", n, "| version", (n - 17) // 4, "| error correction H")
