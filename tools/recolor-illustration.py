#!/usr/bin/env python3
"""
recolor-illustration.py — repaint ONLY the green ink in an illustration to
match a given theme-pack accent color, leaving skin tones, line art, and
the white background untouched.

Why this works: the green in these illustrations lives in a narrow hue
band (roughly 100-190 degrees on the color wheel) that's well separated
from skin tones (roughly 10-45 degrees) and from the near-grayscale ink/
background (low saturation). So instead of a blanket hue-rotate (which
would also swing skin tones around the wheel), this:
  1. Converts every pixel to HSV.
  2. Builds a mask of pixels that are BOTH inside the green hue band AND
     saturated enough to be "green ink" rather than a gray/white/black
     line or highlight.
  3. For masked pixels only, rotates hue by a fixed delta (green's hue ->
     the target color's hue) while leaving saturation and value alone —
     that's what keeps every existing shade/highlight/shadow in the
     illustration intact, just repainted in the new hue.
  4. Everything outside the mask (skin, hair, outlines, background) is
     copied through completely unchanged.

Usage:
    python3 recolor-illustration.py <input.png> <#targetHex> <output.png>
    python3 recolor-illustration.py <input.png> <#targetHex> <output.png> \
        --green-hue 100-190 --min-sat 0.15 --sat-match 0.0

--green-hue   the hue band (in degrees, 0-360) treated as "the green to
              replace". Default 100-190 covers this illustration set;
              widen/narrow it if a different source image uses a
              different green.
--min-sat     pixels below this saturation are left alone even if their
              hue falls in the green band (catches near-white highlights
              and near-black shadow lines so they don't get tinted).
              Default 0.04 — low enough to catch the pale mint background
              blobs/shadows this illustration set uses, high enough to
              leave true grays alone.
--sat-match   0.0 = keep each pixel's original saturation (default,
              truest to the original shading). 1.0 = fully match the
              target color's own saturation instead. Anything between
              blends the two — useful if a very desaturated theme color
              (e.g. Orchid) is coming out looking washed-out or a very
              saturated one (e.g. Sunset) is coming out too intense
              compared to the rest of the illustration.
--val-match   0.0 = keep each pixel's original brightness (default).
              Warm target hues (orange/amber) sitting at this artwork's
              dark shading level read as brown rather than vivid orange
              — val-match lifts brightness toward the target color's own
              (proportionally, so shading depth is preserved) to fix
              that. Try 0.3-0.6 for orange/amber-ish targets; leave at 0
              for targets already close in darkness to the source green
              (purples, teals, blues — see the sample outputs).
"""
import sys
import argparse
import colorsys
import numpy as np
from PIL import Image


def hex_to_hsv(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(r, g, b)


def recolor(im, target_hex, green_hue=(100, 190), min_sat=0.04, sat_match=0.0, val_match=0.0):
    im = im.convert('RGBA')
    arr = np.asarray(im).astype(np.float32) / 255.0
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    maxc = np.max(arr[..., :3], axis=-1)
    minc = np.min(arr[..., :3], axis=-1)
    v = maxc
    s = np.where(maxc > 0, (maxc - minc) / np.where(maxc == 0, 1, maxc), 0)

    rc = np.where(maxc - minc == 0, 0, (maxc - r) / np.where(maxc - minc == 0, 1, maxc - minc))
    gc = np.where(maxc - minc == 0, 0, (maxc - g) / np.where(maxc - minc == 0, 1, maxc - minc))
    bc = np.where(maxc - minc == 0, 0, (maxc - b) / np.where(maxc - minc == 0, 1, maxc - minc))
    h = np.zeros_like(maxc)
    is_r = (maxc == r) & (maxc != minc)
    is_g = (maxc == g) & (maxc != minc) & ~is_r
    is_b = (maxc == b) & (maxc != minc) & ~is_r & ~is_g
    h = np.where(is_r, (bc - gc), h)
    h = np.where(is_g, 2.0 + rc - bc, h)
    h = np.where(is_b, 4.0 + gc - rc, h)
    h = (h / 6.0) % 1.0
    hue_deg = h * 360

    lo, hi = green_hue
    mask = (hue_deg >= lo) & (hue_deg <= hi) & (s >= min_sat)

    target_h, target_s, target_v = hex_to_hsv(target_hex)
    # Anchor the rotation on the illustration's dominant green hue rather
    # than the band's edge, so mid-band greens land closest to the target
    # and the shift feels like "the same picture, repainted" rather than
    # a uniform wheel-spin.
    src_anchor = np.median(hue_deg[mask]) / 360 if mask.any() else (sum(green_hue) / 2) / 360
    delta = target_h - src_anchor

    new_h = np.where(mask, (h + delta) % 1.0, h)
    new_s = np.where(mask, s * (1 - sat_match) + target_s * sat_match, s)
    # Warm hues (orange/amber) read as brown instead of vivid at the low
    # brightness this artwork's dark-green shading sits at — val_match
    # blends each masked pixel's brightness toward the target color's own
    # brightness (relative to the darkest green shade, so shading/depth
    # is still preserved, just lifted as a whole) to compensate.
    if val_match > 0:
        lifted_v = v * (1 - val_match) + target_v * val_match
        new_v = np.where(mask, np.clip(lifted_v, 0, 1), v)
    else:
        new_v = v

    # HSV -> RGB, vectorized.
    i = np.floor(new_h * 6.0)
    f = new_h * 6.0 - i
    p = new_v * (1.0 - new_s)
    q = new_v * (1.0 - f * new_s)
    t = new_v * (1.0 - (1.0 - f) * new_s)
    i_mod = i.astype(int) % 6

    conds = [i_mod == k for k in range(6)]
    r_out = np.select(conds, [new_v, q, p, p, t, new_v], default=new_v)
    g_out = np.select(conds, [t, new_v, new_v, q, p, p], default=new_v)
    b_out = np.select(conds, [p, p, t, new_v, new_v, q], default=new_v)

    out = np.stack([
        np.where(mask, r_out, r),
        np.where(mask, g_out, g),
        np.where(mask, b_out, b),
        a,
    ], axis=-1)
    out = np.clip(out * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode='RGBA')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('input')
    ap.add_argument('target_hex')
    ap.add_argument('output')
    ap.add_argument('--green-hue', default='100-190')
    ap.add_argument('--min-sat', type=float, default=0.04)
    ap.add_argument('--sat-match', type=float, default=0.0)
    ap.add_argument('--val-match', type=float, default=0.0)
    args = ap.parse_args()

    lo, hi = (float(x) for x in args.green_hue.split('-'))
    im = Image.open(args.input)
    out = recolor(im, args.target_hex, green_hue=(lo, hi), min_sat=args.min_sat,
                  sat_match=args.sat_match, val_match=args.val_match)
    out.save(args.output)
    print(f'Wrote {args.output}')


if __name__ == '__main__':
    main()
