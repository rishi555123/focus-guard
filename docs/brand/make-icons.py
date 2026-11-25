"""Make every Focus Guard icon and logo from docs/brand/logo-icon.png.

Run from the repository root:  python docs/brand/make-icons.py
Needs Python 3 with Pillow, NumPy and SciPy (pip install pillow numpy scipy).

The master has an off-white background. Every colour in the logo has one channel near 0
(navy's red, yellow's blue), so the smallest channel says how much of each pixel is logo,
which turns the background transparent. Colours are then snapped to the two brand colours.

Writes:
  icons/icon16.png, icon32.png, icon48.png  toolbar and extensions page, with a thin light
                                            outline so the navy reads on dark toolbars too.
                                            16 px shows just the FG shield, which stays readable.
  icons/icon128.png                         extension and notification icon (Chrome's 96 px
                                            artwork in a 128 px square), no outline
  icons/logo-256.png, logo-256-dark.png     the logo on the extension's own pages, light and dark
  site/images/icon-128.png, icon-128-dark.png, favicon-32.png, site/favicon.ico
  docs/store/logo-128.png, logo-300.png
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
out = lambda *p: os.path.join(ROOT, *p)

NAVY, YELLOW = np.array([5, 43, 92.0]), np.array([255, 192, 4.0])
DARK_INK = (0xDC, 0xE6, 0xF5)   # the dark theme's light ink, for the dark logos
OUTLINE = (255, 255, 255)       # around the toolbar icons


def transparent_mark(src):
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64)
    white, ink = 252.0, 6.0
    a = np.clip((white - rgb.min(axis=2)) / (white - ink), 0, 1)
    # the colour under the paper, then whichever brand colour is nearer
    safe = np.where(a > 0, a, 1)[..., None]
    under = np.clip((rgb - 255 * (1 - a[..., None])) / safe, 0, 255)
    near_yellow = ((under - YELLOW) ** 2).sum(2) < ((under - NAVY) ** 2).sum(2)
    col = np.where(near_yellow[..., None], YELLOW, NAVY)
    mark = Image.fromarray(np.dstack([col, a * 255]).round().astype(np.uint8), "RGBA")
    return crop(mark)


def crop(img):
    return img.crop(img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def square(img, pad):
    """Centre on a transparent square with `pad` (a fraction of the side) on each side."""
    w, h = img.size
    side = round(max(w, h) / (1 - 2 * pad))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def shield_only(mark):
    """Just the FG shield: the two largest shapes below the brain."""
    arr = np.asarray(mark)
    labels, n = ndimage.label(arr[..., 3] > 128)
    boxes = ndimage.find_objects(labels)
    sizes = ndimage.sum(arr[..., 3] > 128, labels, range(1, n + 1))
    h = arr.shape[0]
    # the shield's two halves are the biggest shapes that reach the bottom quarter
    low = [i + 1 for i, b in enumerate(boxes) if b[0].stop > h * 0.75]
    keep = sorted(low, key=lambda i: -sizes[i - 1])[:2]
    mask = ndimage.binary_dilation(np.isin(labels, keep), iterations=4)
    a = arr.copy()
    a[~mask, 3] = 0
    return crop(Image.fromarray(a, "RGBA"))


def recolour(img, navy_to):
    arr = np.asarray(img).copy()
    navy = arr[..., 2] > arr[..., 1]  # navy is blue-heavy, yellow isn't
    arr[navy, :3] = navy_to
    return Image.fromarray(arr, "RGBA")


def outlined(img, px, width):
    """`img` shrunk to `px` square with a light outline `width` pixels wide around it.
    Drawn at 8x and shrunk, so the outline stays smooth at small sizes."""
    big = img.resize((px * 8, px * 8), Image.LANCZOS)
    alpha = np.asarray(big)[..., 3] > 96
    ring = ndimage.distance_transform_edt(~alpha) <= width * 8
    halo = np.zeros((px * 8, px * 8, 4), np.uint8)
    halo[ring] = (*OUTLINE, 255)
    canvas = Image.fromarray(halo, "RGBA").filter(_soften())
    canvas.alpha_composite(big)
    return canvas.resize((px, px), Image.LANCZOS)


def _soften():
    from PIL import ImageFilter
    return ImageFilter.GaussianBlur(2)


def save(img, *path):
    img.save(out(*path), optimize=True)


def main():
    mark = transparent_mark(out("docs", "brand", "logo-icon.png"))
    full = square(mark, 0.03)
    icon128 = square(mark, 16 / 128)

    # Toolbar sizes, with room for the outline
    save(outlined(square(shield_only(mark), 0.07), 16, 1.0), "icons", "icon16.png")
    save(outlined(square(mark, 0.05), 32, 1.25), "icons", "icon32.png")
    save(outlined(square(mark, 0.05), 48, 1.5), "icons", "icon48.png")
    save(icon128.resize((128, 128), Image.LANCZOS), "icons", "icon128.png")

    # The extension's pages
    logo = full.resize((256, 256), Image.LANCZOS)
    save(logo, "icons", "logo-256.png")
    save(recolour(logo, DARK_INK), "icons", "logo-256-dark.png")

    # Website and store copies
    save(icon128.resize((128, 128), Image.LANCZOS), "site", "images", "icon-128.png")
    save(recolour(icon128, DARK_INK).resize((128, 128), Image.LANCZOS), "site", "images", "icon-128-dark.png")
    icons = {px: Image.open(out("icons", f"icon{px}.png")) for px in (16, 32, 48)}
    save(icons[32], "site", "images", "favicon-32.png")
    icons[48].save(out("site", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]])
    save(full.resize((128, 128), Image.LANCZOS), "docs", "store", "logo-128.png")
    save(full.resize((300, 300), Image.LANCZOS), "docs", "store", "logo-300.png")


if __name__ == "__main__":
    main()
