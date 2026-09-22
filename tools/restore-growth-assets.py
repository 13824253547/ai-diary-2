"""Repair locally bounded growth illustrations from the original PPT media.

Requires Pillow, NumPy and OpenCV (opencv-python-headless). Example with the
bundled Python: PYTHONPATH=/tmp/ai-diary-growth-image-deps python3 tools/restore-growth-assets.py
No page screenshot is used as an application background. Original files stay
untouched; captions are removed with a glyph mask, never rectangular alpha holes.
"""
from pathlib import Path
import hashlib
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
try:
    import cv2
except ImportError as exc:
    raise SystemExit('Install opencv-python-headless in a local Python environment before running this script.') from exc

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'design/extracted/ppt_media'
OUT = ROOT / 'assets/restored'
DOCS = ROOT / 'docs/business'
BACKGROUND = '#FFF3E5'
TREE_CROP = (38, 302, 497, 918)
FLOWERS_CROP = (1043, 210, 1505, 705)
GLOBE_CROP = (1808, 552, 1970, 734)
# Each box tightly bounds glyphs, not the underlying decorative plate.
TREE_GLYPHS = [
    ((70, 384, 142, 403), 185), ((392, 446, 464, 466), 185),
    ((404, 640, 464, 659), 185), ((83, 671, 157, 691), 185),
    ((240, 758, 385, 779), 150),
]
FLOWER_GLYPHS = [
    ((1100, 448, 1247, 470), 155), ((1322, 495, 1459, 516), 155),
    ((1167, 636, 1305, 656), 185), ((1200, 659, 1269, 679), 185),
]


def local_box(box, crop):
    return [box[0] - crop[0], box[1] - crop[1], box[2] - crop[0], box[3] - crop[1]]


def erase_glyphs(image, entries):
    """Only the dark letter pixels and their antialias fringe are replaced."""
    rgb = np.array(image.convert('RGB'))
    mask = np.zeros(rgb.shape[:2], dtype=np.uint8)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    for (left, top, right, bottom), threshold in entries:
        glyph = np.uint8(gray[top:bottom, left:right] < threshold) * 255
        glyph = cv2.dilate(glyph, np.ones((3, 3), np.uint8), iterations=1)
        mask[top:bottom, left:right] = np.maximum(mask[top:bottom, left:right], glyph)
    # These tiny masks follow individual letter strokes. The label fills,
    # shadows, borders and ribbons are never cleared or made transparent.
    repaired = cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA)
    return Image.fromarray(repaired), mask


def edge_blend(image, color=BACKGROUND, side=12, top=8, bottom=12):
    """Blend only the external crop edge into the surrounding native UI color."""
    a = np.array(image.convert('RGB')).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    weight = np.minimum.reduce([
        np.clip(xx / side, 0, 1), np.clip((w - 1 - xx) / side, 0, 1),
        np.clip(yy / top, 0, 1), np.clip((h - 1 - yy) / bottom, 0, 1),
    ])
    # Smoothstep has no derivative discontinuity at the join.
    weight = (weight * weight * (3 - 2 * weight))[..., None]
    bg = np.array(Image.new('RGB', (1, 1), color))[0, 0]
    return Image.fromarray(np.uint8(np.round(a * weight + bg * (1 - weight))))


def opened_third_flower(repaired):
    """Same-source demo composite: replace the grey bud with a real open bloom.

    Only the old bud is inpainted. The native pedestal, its shadow, green calyx
    and caption plate remain in place. The petals come from the first flower in
    the same slide, including their original translucent warm highlights.
    """
    rgb = np.array(repaired)
    bud_mask = Image.new('L', repaired.size, 0)
    draw = ImageDraw.Draw(bud_mask)
    draw.polygon([(1219,499),(1248,502),(1275,511),(1291,526),(1298,545),
                  (1297,568),(1288,590),(1269,605),(1234,613),(1205,607),
                  (1189,592),(1178,570),(1175,543),(1180,521),(1197,506)], fill=255)
    mask = np.array(bud_mask)
    mask = cv2.dilate(mask, np.ones((3,3),np.uint8))
    base = Image.fromarray(cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA)).convert('RGBA')
    # Hand-traced outer petal contour; no color-key removes translucent petals.
    bloom = repaired.crop((1075,219,1267,358)).convert('RGBA')
    alpha = Image.new('L', bloom.size, 0)
    d = ImageDraw.Draw(alpha)
    d.polygon([(50,12),(65,15),(81,5),(99,0),(116,3),(128,12),(130,28),
               (145,28),(160,36),(179,44),(190,61),(191,80),(181,96),
               (174,109),(157,122),(139,126),(122,133),(99,138),
               (76,134),(65,125),(49,125),(34,117),(30,106),(13,104),
               (5,89),(0,73),(7,55),(21,48),(21,33),(30,20)], fill=255)
    bloom.putalpha(alpha.filter(ImageFilter.GaussianBlur(.6)))
    bloom = bloom.resize((149, 108), Image.Resampling.LANCZOS)
    base.alpha_composite(bloom, (1160, 497))
    return base.convert('RGB')


def plate(name, text, box, glyph_box, crop):
    return {'id': name, 'text': text, 'plate_box_px': local_box(box, crop),
            'text_box_px': local_box(glyph_box, crop)}


def main():
    OUT.mkdir(exist_ok=True, parents=True)
    DOCS.mkdir(exist_ok=True, parents=True)
    source = Image.open(MEDIA / 'image14.png').convert('RGB')
    repaired, mask = erase_glyphs(source, TREE_GLYPHS + FLOWER_GLYPHS)
    tree = edge_blend(repaired.crop(TREE_CROP))
    flowers = edge_blend(repaired.crop(FLOWERS_CROP), side=16, top=10, bottom=14)
    unlocked = edge_blend(opened_third_flower(repaired).crop(FLOWERS_CROP), side=16, top=10, bottom=14)
    # Do not color-key the glass. Its baked translucent backdrop is preserved.
    globe_source = Image.open(MEDIA / 'image4.png').convert('RGB')
    globe = edge_blend(globe_source.crop(GLOBE_CROP), color='#FFF9F1', side=6, top=7, bottom=3)
    outputs = {'growth-tree.png': tree, 'growth-flowers-locked.png': flowers,
               'growth-flowers-unlocked.png': unlocked, 'growth-globe.png': globe}
    for filename, image in outputs.items():
        image.save(OUT / filename)
    Image.fromarray(mask).crop(TREE_CROP).save(OUT / 'tree-glyph-mask.png')
    Image.fromarray(mask).crop(FLOWERS_CROP).save(OUT / 'flowers-glyph-mask.png')
    tree_labels = [
        plate('friends','珍视旧友',(52,373,156,414),(70,384,142,403),TREE_CROP),
        plate('light','追光的人',(375,435,480,477),(392,446,464,466),TREE_CROP),
        plate('mountains','山与海',(385,629,480,672),(404,640,464,659),TREE_CROP),
        plate('food','深夜食堂',(69,658,176,702),(83,671,157,691),TREE_CROP),
        plate('ribbon','人生旷野的寻路者',(211,739,414,792),(240,758,385,779),TREE_CROP),
    ]
    flower_labels = [
        plate('first','人生旷野的寻路者',(1075,438,1265,490),(1100,448,1247,470),FLOWERS_CROP),
        plate('second','觉察自我的思考者',(1299,485,1475,530),(1322,495,1459,516),FLOWERS_CROP),
        plate('third','压力迷茫的疗愈者',(1150,625,1318,689),(1167,636,1305,679),FLOWERS_CROP),
    ]
    metadata = {
        'source':'AI日记设计图04.pptx',
        'method':'Original illustration-only crops; dark glyph pixel inpainting; no rectangular transparent holes; edge color blending.',
        'coordinates':'Boxes are [left, top, right, bottom] in native asset pixels. Scale all coordinates and text together by renderedWidth / nativeWidth. Native text overlays should have transparent backgrounds.',
        'tree':{'file':'assets/restored/growth-tree.png','source_media':'image14.png','source_size_px':list(source.size),'crop_px':TREE_CROP,'size_px':list(tree.size),'background':BACKGROUND,'labels':tree_labels},
        'flowers':{'locked_file':'assets/restored/growth-flowers-locked.png','unlocked_file':'assets/restored/growth-flowers-unlocked.png','source_media':'image14.png','crop_px':FLOWERS_CROP,'size_px':list(flowers.size),'background':BACKGROUND,'labels':flower_labels,'third_state_text':{'locked':'压力迷茫的疗愈者\n· 未解锁','unlocked':'压力迷茫的疗愈者\n· 已绽放'},'unlocked_composite':{'bloom_source_crop_px':[1075,219,1267,358],'size_px':[149,108],'destination_px':[1160,497],'note':'Demo-only original-source composite, not an unseen PPT design or AI-generated asset.'}},
        'globe':{'file':'assets/restored/growth-globe.png','source_media':'image4.png','source_size_px':list(globe_source.size),'crop_px':GLOBE_CROP,'size_px':list(globe.size),'background':'#FFF9F1','note':'Original glass and its baked translucency retained.'},
        'limitations':['PPT media are flat raster artwork; hidden background details and true per-layer transparency cannot be recovered losslessly.','Native tree is 459×616 px, flowers 462×495 px, glass globe 162×182 px; no false high-resolution claim.','The third unlocked flower is a local demonstration composite using an existing bloom; no corresponding unlocked reference was provided.'],
        'files':[{ 'path':'assets/restored/'+name,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest(),'size_px':list(im.size)} for name,im in outputs.items()],
    }
    (DOCS/'growth-assets.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    # Inspection contact sheet uses the exact surrounding page colors.
    preview=Image.new('RGB',(1180,850),BACKGROUND)
    preview.paste(tree,(12,30))
    preview.paste(flowers,(490,30))
    preview.paste(globe,(990,30))
    preview.paste(unlocked.resize((277,297),Image.Resampling.LANCZOS),(490,540))
    preview.save(OUT/'restoration-preview.jpg',quality=94)
    print('Restored 4 illustrations; original media untouched. Glyph pixels repaired:',int(np.count_nonzero(mask)))

if __name__ == '__main__':
    main()
