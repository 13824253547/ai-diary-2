"""Build honest, same-width growth screenshots from saved simulator captures.

Requires Pillow. Never operates a simulator or edits the source screenshots.
The explicit DEV OVERLAY mask excludes Expo's grey gear (including its shadow),
not an application defect. Per-source crops and mask bounds are recorded.
"""
from pathlib import Path
import json

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/verification/growth-20260922'
OUT = BASE / 'comparisons'
SCREEN_CROP = (0, 180, 1206, 2520)
GEAR_MASK = (963, 420, 1206, 645)
WIDTH = 462
GAP = 24
HEADER = 58
FOOTER = 40
BG = '#E9E8E5'
FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf'
FONT = ImageFont.truetype(FONT_PATH, 17)
SMALL_FONT = ImageFont.truetype(FONT_PATH, 12)
PAGES = {
    'growth': 'step-19-growth.png',
    'anchors': 'step-20-anchors.png',
    'flowers': 'step-21-flowers.png',
    'report': 'step-22-insights.png',
}


def source_image(path, crop, mask=None):
    image = Image.open(path).convert('RGB')
    if mask:
        draw = ImageDraw.Draw(image)
        draw.rectangle(mask, fill='#D8D8D8', outline='#686868', width=3)
        # Deliberately opaque and labelled: this is an exclusion, not a repair.
        draw.text((mask[0] + 16, mask[1] + 80), 'DEV OVERLAY', font=ImageFont.truetype(FONT_PATH, 24), fill='#454545')
        draw.text((mask[0] + 16, mask[1] + 115), 'EXCLUDED', font=ImageFont.truetype(FONT_PATH, 24), fill='#454545')
    image = image.crop(crop)
    return image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.Resampling.LANCZOS)


def comparison(name, specs):
    images = [source_image(path, crop, mask) for _, path, crop, mask in specs]
    max_height = max(image.height for image in images)
    canvas = Image.new('RGB', (WIDTH * 3 + GAP * 4, HEADER + max_height + FOOTER), BG)
    draw = ImageDraw.Draw(canvas)
    for i, (image, (label, _, _, _)) in enumerate(zip(images, specs)):
        x = GAP + i * (WIDTH + GAP)
        draw.text((x, 18), label, fill='#242424', font=FONT)
        canvas.paste(image, (x, HEADER))
    draw.text((GAP, HEADER + max_height + 12), 'Equal content width; aspect ratio preserved. Grey marked boxes are excluded developer overlays.', fill='#454545', font=SMALL_FONT)
    canvas.save(OUT / f'{name}.png')
    return {
        'output': str((OUT / f'{name}.png').relative_to(ROOT)),
        'column_width_px': WIDTH,
        'sources': [{
            'label': label, 'path': str(path.relative_to(ROOT)),
            'crop_px': crop, 'excluded_overlay_px': mask,
        } for label, path, crop, mask in specs],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for name, reference in PAGES.items():
        design = ROOT / 'design/extracted' / reference
        w, h = Image.open(design).size
        results.append(comparison(name, [
            ('DESIGN / PPT', design, (0, 50, w, h - 10), None),
            ('BEFORE / iPhone 17', BASE / 'before' / f'{name}.png', SCREEN_CROP, GEAR_MASK),
            ('AFTER / iPhone 17', BASE / 'after' / f'{name}-final.png', SCREEN_CROP, GEAR_MASK),
        ]))
    reference = BASE / 'references/profile-entry-user.png'
    # The retained user image has a few pixels of the preceding card at its top.
    results.append(comparison('profile-entry', [
        ('DESIGN / supplied image 10', reference, (16, 17, 680, 302), None),
        ('BEFORE / entry crop', BASE / 'before/profile.png', (52, 1326, 1154, 1780), None),
        ('AFTER / entry crop', BASE / 'after/profile-final.png', (52, 1326, 1154, 1780), None),
    ]))
    (OUT / 'comparison-manifest.json').write_text(json.dumps({
        'method': 'Source PNGs remain unchanged. System status and bottom safe areas are cropped. A labelled opaque mask excludes the fixed grey Expo developer gear and its shadow. No inpainting, retouching, or UI error removal is applied to comparison screenshots.',
        'coordinates': 'All boxes are [left, top, right, bottom] in original source pixels. Columns retain aspect ratio and normalize content width only; extra vertical canvas is neutral grey.',
        'comparisons': results,
    }, ensure_ascii=False, indent=2) + '\n')
    print('Created five comparisons; source screenshots are unchanged.')


if __name__ == '__main__':
    main()
