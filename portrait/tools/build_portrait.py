"""Bake the supplied 1600 x 1056 photograph into a small, offline point cloud.

Usage: python tools/build_portrait.py path/to/portrait.png (Pillow and NumPy)
The outline and facial landmarks below are specific to this photograph.
"""
import base64
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def bezier_outline(start, segments):
    vertices = [start]
    for segment in segments:
        a, b, end = np.asarray(segment).reshape(3, 2)
        origin = np.asarray(vertices[-1])
        for t in np.linspace(0, 1, 22)[1:]:
            point = (1-t)**3*origin + 3*(1-t)**2*t*a + 3*(1-t)*t*t*b + t**3*end
            vertices.append(tuple(point))
    return vertices


photo = Image.open(sys.argv[1]).convert("L")
if photo.size != (1600, 1056):
    raise ValueError("This outline requires the original 1600 x 1056 photograph.")
photo = photo.filter(ImageFilter.MedianFilter(3))
lum = np.asarray(photo, dtype=float) / 255
blur = np.asarray(photo.filter(ImageFilter.GaussianBlur(11)), dtype=float) / 255

# Coordinates stay in photograph space. Continue the cropped crown and shoulders.
outline = bezier_outline((43, 1056), [
    (130, 943, 252, 901, 396, 847), (443, 822, 455, 749, 454, 684),
    (449, 611, 438, 541, 415, 491), (400, 517, 365, 519, 347, 490),
    (316, 457, 309, 397, 312, 350), (267, 300, 263, 196, 322, 165),
    (342, 131, 330, 12, 353, -73), (383, -217, 488, -332, 644, -357),
    (763, -388, 915, -373, 1000, -325), (1110, -276, 1171, -186, 1183, -64),
    (1200, 30, 1177, 121, 1157, 202), (1147, 243, 1157, 265, 1137, 284),
    (1135, 308, 1125, 348, 1110, 377), (1099, 443, 1125, 514, 1087, 582),
    (1069, 655, 1030, 714, 1005, 749), (1080, 742, 1145, 802, 1190, 823),
    (1290, 817, 1395, 767, 1463, 819), (1516, 849, 1531, 942, 1601, 1009),
    (1665, 1068, 1705, 1140, 1730, 1210), (1100, 1240, 500, 1250, -75, 1210),
    (-43, 1160, 0, 1100, 43, 1056)
])
mask = Image.new("L", (1860, 1650))
draw = ImageDraw.Draw(mask)
draw.polygon([(x+100, y+400) for x,y in outline], fill=255)
# Preserve the hanging earring in the negative space beside the neck.
draw.polygon([(x+100,y+400) for x,y in [(367,478),(389,478),(386,582),
    (407,669),(396,728),(406,808),(377,865),(352,847),(374,780),
    (358,719),(376,657),(361,587)]],fill=255)

rng = np.random.default_rng(19)
u, v = np.meshgrid(np.arange(-110, 1770, 4.55), np.arange(-408, 1240, 4.55))
# Curved rows describe the surface, including in the gaps between highlights.
u += 1.8*(np.indices(u.shape)[0] % 2) + rng.normal(0, .51, u.shape)
v += rng.normal(0, .54, v.shape)
def mound(cx, cy, sx, sy):
    return np.exp(-((u-cx)/sx)**2 - ((v-cy)/sy)**2)

head = mound(785, 230, 485, 715)
z = (135*head + 90*mound(951,433,110,200) + 39*mound(832,652,218,95)
     + 34*mound(768,809,204,121) - 38*mound(719,270,119,62)
     - 34*mound(1066,314,77,53) + 46*mound(659,445,168,126))
x = u + 44*np.sin((u-740)/234)*head + 20*mound(961,465,120,140)
y = v + 67*head + 27*np.sin((u-480)/165)*mound(770,270,420,470) + .16*z
inside = np.asarray(mask)[np.clip((y+400).astype(int),0,1649),np.clip((x+100).astype(int),0,1859)] > 0
x,y,z = x[inside],y[inside],z[inside]
ix = np.clip(x.astype(int),0,1599)
iy = np.clip(y.astype(int),0,1055)
value = lum[iy,ix] + .85*(lum[iy,ix]-blur[iy,ix])

# Above the photograph, complete the hair with curved, fine directional strands.
cap = y < 0
hairline = -146 + .0022*(x-942)**2
forehead = np.clip((y-hairline+8)/18,0,1)
hair = (.09 + .085*(.5+.5*np.cos((x+.39*y+.0010*(y+95)**2)*.083))**3
        + .075*np.exp(-((x-580)/225)**2-((y+153)/146)**2))
skin = lum[0,ix]*.90 + .045
extension = hair*(1-forehead) + skin*forehead
blend = np.clip(-y/70,0,1)
value[cap] = ((1-blend)*value+blend*extension)[cap]
value = np.clip(value,0,1)
tone = np.clip((value-.038)*1.33,0,1)**.85
# Deterministic gaps give shadow areas an open, stippled texture.
dissolve = np.clip((1205-y)/175,0,1)
keep = rng.random(len(x)) < (.49+.49*np.sqrt(tone))*dissolve**1.5
samples = np.column_stack((x[keep]*8, y[keep]*8, z[keep]*16,
                           tone[keep]*4095)).round().astype("<i2")
encoded = base64.b64encode(samples.tobytes()).decode("ascii")
asset = Path(__file__).resolve().parents[1] / "dist/assets/portrait.js"
asset.write_text('const PORTRAIT_POINTS = "' + encoded + '";\n', encoding="ascii")
print(f"Saved {len(samples):,} portrait points.")
