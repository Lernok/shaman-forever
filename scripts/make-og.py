# The link preview card (Reddit, Discord, WhatsApp...): img/og.jpg, 1200x630.
# The three talent tree arts side by side, the spec icons and the site's pitch.
#   python scripts/make-og.py      (downloads the art into .cache/og/)
import io
import os
import urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'og')
ZAM = 'https://wow.zamimg.com/images/wow/'
W, H = 1200, 630
TREES = [('261', 'spell_nature_lightning', (224, 116, 44)), ('263', 'spell_nature_lightningshield', (176, 122, 66)), ('262', 'spell_nature_magicimmunity', (63, 169, 245))]


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
            f.write(r.read())
    return Image.open(path).convert('RGB')


def font(name, size):
    return ImageFont.truetype(os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', name), size)


img = Image.new('RGB', (W, H), (12, 13, 16))
# Three tree arts as vertical bands, darkened.
band = W // 3
for k, (bg, _, _) in enumerate(TREES):
    art = fetch(ZAM + 'talents/backgrounds/classic/' + bg + '.jpg', 'tree-' + bg + '.jpg')
    scale = max(band / art.width, H / art.height)
    art = art.resize((int(art.width * scale) + 1, int(art.height * scale) + 1))
    left = (art.width - band) // 2
    img.paste(art.crop((left, 0, left + band, H)), (k * band, 0))
img = img.filter(ImageFilter.GaussianBlur(2))
shade = Image.new('RGBA', (W, H), (10, 11, 14, 175))
img = Image.alpha_composite(img.convert('RGBA'), shade)
# Bottom fade for the text.
fade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(fade)
for y in range(H):
    a = int(max(0, (y - 180) / (H - 180)) * 200)
    d.line([(0, y), (W, y)], fill=(8, 9, 12, a))
img = Image.alpha_composite(img, fade)
draw = ImageDraw.Draw(img)

# Class icon and title.
icon = fetch(ZAM + 'icons/large/classicon_shaman.jpg', 'classicon.jpg').resize((112, 112))
draw.rounded_rectangle((70, 70, 70 + 120, 70 + 120), 18, fill=(0, 0, 0), outline=(200, 170, 110), width=3)
img.paste(icon, (74, 74))
draw.text((214, 78), 'Shaman', font=font('georgiab.ttf', 78), fill=(240, 236, 228))
draw.text((218, 168), 'WORLD OF WARCRAFT: FOREVER', font=font('segoeuib.ttf', 24), fill=(200, 170, 110))

draw.text((72, 262), 'Your gear path, talents and spells', font=font('segoeuib.ttf', 50), fill=(255, 255, 255))
draw.text((72, 326), 'built for your race, spec and professions', font=font('segoeui.ttf', 40), fill=(205, 208, 216))

# Spec chips.
x = 72
for (bg, ic, color), name in zip(TREES, ['Elemental', 'Enhancement', 'Restoration']):
    chip = fetch(ZAM + 'icons/large/' + ic + '.jpg', ic + '.jpg').resize((52, 52))
    f = font('segoeuib.ttf', 30)
    tw = int(draw.textlength(name, font=f))
    draw.rounded_rectangle((x, 420, x + 76 + tw, 488), 14, fill=(22, 24, 30), outline=color, width=3)
    img.paste(chip, (x + 8, 428))
    draw.text((x + 70, 434), name, font=f, fill=(240, 240, 240))
    x += 76 + tw + 22

draw.text((72, 540), 'Data read from the game client · English & Español · lernok.github.io/shaman-forever', font=font('segoeui.ttf', 26), fill=(170, 174, 184))

os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
img.convert('RGB').save(os.path.join(ROOT, 'img', 'og.jpg'), quality=88, optimize=True)
print('img/og.jpg', os.path.getsize(os.path.join(ROOT, 'img', 'og.jpg')), 'bytes')
