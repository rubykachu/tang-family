"""Isolate one connector-line colour of the scanned tree to make line tracing unambiguous.

Usage: python3 colormask.py SRC x y w h scale out.png [colour,colour,...]
SRC is the scan image (tools/crop.sh extracts it from gia-pha.pdf into $TMPDIR/gia-pha-scan-000.jpg).
Writes one tile per colour (default: green,orange,yellow,red), stacked vertically; the chosen
colour is drawn black on a faint copy of the crop. Colours: green orange yellow red purple blue cyan.
"""
import sys, cv2, numpy as np

src, x, y, w, h, scale, out = sys.argv[1], *map(int, sys.argv[2:6]), float(sys.argv[6]), sys.argv[7]
im = cv2.imread(src)[y:y + h, x:x + w]
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
H, S, V = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
sat = (S > 110) & (V > 120)
masks = {
    'green': sat & (H >= 40) & (H <= 85),
    'orange': sat & (H >= 5) & (H <= 16),
    'yellow': sat & (H >= 22) & (H <= 35),
    'red': sat & ((H >= 165) | (H <= 4)),
    'purple': sat & (H >= 140) & (H <= 162),
    'blue': sat & (H >= 101) & (H <= 125),
    'cyan': (S > 70) & (V > 150) & (H >= 85) & (H <= 100),
}
wanted = sys.argv[8].split(',') if len(sys.argv) > 8 else ['green', 'orange', 'yellow', 'red']
masks = {k: masks[k] for k in wanted}
tiles = []
for name, m in masks.items():
    base = (255 - (255 - cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)) // 5)
    t = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    t[m] = (0, 0, 0)
    cv2.putText(t, name, (10, 50), 0, 1.6, (0, 0, 255), 3)
    tiles.append(cv2.resize(t, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA))
cv2.imwrite(out, np.vstack(tiles))
