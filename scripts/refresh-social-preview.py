from io import BytesIO
from pathlib import Path
from urllib.request import urlretrieve

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT, SCALE = 1200, 630, 3
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
FONT_PATH = Path("/tmp/piantee-playfair-display.ttf")

# Use the existing, unmodified SVG as the only artwork; no recreated avocado.
urlretrieve(FONT_URL, FONT_PATH)
canvas = Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE), "#173B2D")
icon_width = 380 * SCALE
icon_bytes = cairosvg.svg2png(url=str(ROOT / "favicon.svg"),
    output_width=icon_width, output_height=icon_width)
icon = Image.open(BytesIO(icon_bytes)).convert("RGBA")
canvas.alpha_composite(icon, (91 * SCALE, 125 * SCALE))

drawer = ImageDraw.Draw(canvas)
label = "Piantee"
font_size = 160 * SCALE
font = ImageFont.truetype(str(FONT_PATH), font_size)
font.set_variation_by_axes([700])
text_x = 505 * SCALE
while drawer.textbbox((0, 0), label, font=font)[2] > (WIDTH - 75 - 505) * SCALE:
    font_size -= 3 * SCALE
    font = ImageFont.truetype(str(FONT_PATH), font_size)
    font.set_variation_by_axes([700])
bbox = drawer.textbbox((0, 0), label, font=font)
text_y = ((HEIGHT * SCALE) - (bbox[3] - bbox[1])) // 2 - bbox[1]
drawer.text((text_x, text_y), label, font=font, fill="#F7F8F3")

preview = canvas.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
preview.save(ROOT / "social-preview-v1.png", format="PNG", optimize=True)
assert Image.open(ROOT / "social-preview-v1.png").size == (1200, 630)
