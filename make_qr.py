"""Make the panel QR code for the published listening page.
usage:  python3 make_qr.py https://YOUR-USERNAME.github.io/under-tones/
writes: qr/UNDER-tones_QR.svg (vector, for InDesign) and qr/UNDER-tones_QR.png (1200 px), plus a labelled version.
Requires OpenCV (cv2) — it also decodes the result to verify it."""
import sys, os, cv2, numpy as np
url = sys.argv[1]; os.makedirs("qr", exist_ok=True)
enc = cv2.QRCodeEncoder.create(cv2.QRCodeEncoder_Params()); m = enc.encode(url)          # one px per module, includes no quiet zone
mods = (m < 128).astype(np.uint8); n = mods.shape[0]; qz = 4                              # 4-module quiet zone
N = n + 2 * qz
rects = "".join(f'<rect x="{x + qz}" y="{y + qz}" width="1" height="1"/>' for y, x in zip(*np.nonzero(mods)))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" width="30mm" height="30mm" shape-rendering="crispEdges">'
       f'<rect width="{N}" height="{N}" fill="#FFFFFF"/><g fill="#242424">{rects}</g></svg>')
open("qr/UNDER-tones_QR.svg", "w").write(svg)
px = 1200 // N; img = np.full((N * px, N * px), 255, np.uint8)
for y, x in zip(*np.nonzero(mods)): img[(y + qz) * px:(y + qz + 1) * px, (x + qz) * px:(x + qz + 1) * px] = 0x24
cv2.imwrite("qr/UNDER-tones_QR.png", img)
# labelled version: code + "SCAN TO LISTEN: UNDER-TONES" + short URL
short = url.replace("https://", "").rstrip("/")
lab = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N + 14}" width="30mm" height="{30 * (N + 14) / N:.2f}mm">'
       f'<rect width="{N}" height="{N + 14}" fill="#FFFFFF"/><g fill="#242424" shape-rendering="crispEdges">{rects}</g>'
       f'<text x="{N/2}" y="{N + 4.2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="2.0" font-weight="700" letter-spacing="0.12" fill="#242424">SCAN TO LISTEN: UNDER-TONES</text>'
       f'<text x="{N/2}" y="{N + 8.6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="2.1" fill="#777777">{short}</text></svg>')
open("qr/UNDER-tones_QR_labelled.svg", "w").write(lab)
ok, _, _ = cv2.QRCodeDetector().detectAndDecode(img)[0] == url, None, None
print("decoded matches URL:", cv2.QRCodeDetector().detectAndDecode(img)[0] == url, "| modules:", n, "| version ~", (n - 17) // 4)
