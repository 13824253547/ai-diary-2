"""Extract the authoritative PPT crops and reusable image fragments.

Requires Pillow and NumPy. Does not modify the presentation. All image assets
remain at native pixel size; cream removal is edge-connected only.
"""
from pathlib import Path
from collections import deque
import json
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PPT = ROOT / 'AI日记设计图04.pptx'
REF = ROOT / 'design/extracted'
MEDIA = REF / 'ppt_media'
ASSETS = ROOT / 'assets/reference'
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
for directory in (REF, MEDIA, ASSETS):
    directory.mkdir(parents=True, exist_ok=True)

page_names = [
    'home', 'photo-permission', 'photo-select', 'template-select',
    'character-select', 'generating', 'companion-naming', 'edit-diary',
    'generation-complete', 'diary-detail', 'privacy-select', 'share-result',
    'materials', 'pet', 'memories', 'postcard', 'discover', 'profile',
    'growth', 'anchors', 'flowers', 'insights',
]
page_records = []
with zipfile.ZipFile(PPT) as archive:
    for name in archive.namelist():
        if name.startswith('ppt/media/') and name.lower().endswith('.png'):
            (MEDIA / Path(name).name).write_bytes(archive.read(name))
    for slide in (8, 9, 10):
        xml = ET.fromstring(archive.read(f'ppt/slides/slide{slide}.xml'))
        relations = ET.fromstring(archive.read(f'ppt/slides/_rels/slide{slide}.xml.rels'))
        lookup = {node.get('Id'): node.get('Target') for node in relations}
        for position, pic in enumerate(xml.findall('.//p:pic', NS), 1):
            blip = pic.find('.//a:blip', NS)
            name = Path(lookup[blip.get('{' + NS['r'] + '}embed')]).name
            source = Image.open(MEDIA / name).convert('RGB')
            rect = pic.find('.//a:srcRect', NS)
            ratio = rect.attrib if rect is not None else {}
            width, height = source.size
            box = (round(width * int(ratio.get('l', 0)) / 100000), round(height * int(ratio.get('t', 0)) / 100000), round(width * (1 - int(ratio.get('r', 0)) / 100000)), round(height * (1 - int(ratio.get('b', 0)) / 100000)))
            index = (slide - 8) * 4 + position
            filename = f'step-{index:02}-{page_names[index - 1]}.png'
            source.crop(box).save(REF / filename)
            page_records.append({'page': index, 'name': page_names[index - 1], 'file': filename, 'slide': slide, 'position': position, 'source': name, 'crop_px': box, 'srcRect': ratio})

supplement = [
    (13, 5, 'image3.png', (1040, 83, 1496, 1129)),
    (14, 5, 'image3.png', (1527, 83, 1984, 1129)),
    (15, 6, 'image4.png', (33, 89, 499, 1104)),
    (16, 6, 'image4.png', (529, 89, 993, 1104)),
    (17, 6, 'image4.png', (1030, 89, 1495, 1104)),
    (18, 6, 'image4.png', (1527, 89, 2004, 1104)),
    (19, 12, 'image14.png', (37, 97, 499, 1111)),
    (20, 12, 'image14.png', (536, 97, 999, 1111)),
    (21, 12, 'image14.png', (1041, 97, 1507, 1111)),
    (22, 12, 'image14.png', (1544, 97, 2011, 1111)),
]
for index, slide, name, box in supplement:
    filename = f'step-{index:02}-{page_names[index - 1]}.png'
    Image.open(MEDIA / name).crop(box).save(REF / filename)
    page_records.append({'page': index, 'name': page_names[index - 1], 'file': filename, 'slide': slide, 'source': name, 'crop_px': box})

# Coordinates are on native PPT media, and all fragments exclude page chrome.
# Mask backgrounds only where they connect to crop edges; enclosed light fur is preserved.
def cut_cream(image, tolerance=22):
    pixels = np.asarray(image.convert('RGB')).astype(np.int16)
    corners = np.concatenate([pixels[:5, :5].reshape(-1, 3), pixels[:5, -5:].reshape(-1, 3), pixels[-5:, :5].reshape(-1, 3), pixels[-5:, -5:].reshape(-1, 3)])
    background = np.median(corners, axis=0)
    eligible = np.max(np.abs(pixels-background), axis=2) <= tolerance
    h, w = eligible.shape
    visited = np.zeros((h, w), dtype=bool)
    queue = deque([(x, 0) for x in range(w)] + [(x, h-1) for x in range(w)] + [(0, y) for y in range(h)] + [(w-1, y) for y in range(h)])
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h) or visited[y, x] or not eligible[y, x]:
            continue
        visited[y, x] = True
        queue.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
    result = image.convert('RGBA')
    result.putalpha(Image.fromarray(np.where(visited, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.35)))
    return result

# key, media filename, crop (left, top, right, bottom), optional cream threshold
fragments = [
    ('mascot','image1.png',(475,145,1135,840),25),
    ('mascotReading','image1.png',(1670,86,2005,441),24),
    ('mascotCamera','image11.png',(875,1325,1090,1598),0),
    ('mascotHello','image1.png',(1656,510,1990,820),24),
    ('generationHero','image9.png',(106,178,1060,855),18),
    ('tsuki','image2.png',(74,165,666,956),15),
    ('luyi','image2.png',(718,219,1320,950),23),
    ('ralph','image2.png',(1364,190,1990,950),22),
    ('posterTsuki','image3.png',(806,248,981,480),0),
    ('posterLuyi','image3.png',(808,516,981,751),0),
    ('posterRalph','image3.png',(798,783,983,1018),0),
    ('temple','image11.png',(111,663,586,1030),0),
    ('street','image11.png',(597,663,1066,1030),0),
    ('sunset','image11.png',(111,1041,586,1404),0),
    ('food','image11.png',(597,1041,1066,1328),0),
    ('cafe','image3.png',(1344,356,1469,442),0),
    ('flowers','image3.png',(1065,356,1196,468),0),
    ('mountain','image4.png',(1044,291,1246,515),0),
    ('sea','image3.png',(1209,233,1331,344),0),
    ('night','image3.png',(1345,233,1469,344),0),
    ('santorini','image4.png',(1044,614,1246,811),0),
    ('balloons','image4.png',(1261,287,1464,474),0),
    ('train','image4.png',(1261,613,1464,813),0),
    ('lake','image3.png',(1209,357,1331,438),0),
    ('coastalSunset','image7.png',(187,754,311,884),0),
    ('blueHouse','image7.png',(186,434,311,578),0),
    ('restaurant','image7.png',(186,597,311,737),0),
    ('dessert','image7.png',(44,475,168,578),0),
    ('personSelf','image10.png',(174,614,526,897),0),
    ('personFriend','image10.png',(177,1123,525,1403),0),
    ('personSelfAlt','image10.png',(333,897,443,1007),0),
    ('personFriendAlt','image10.png',(451,1408,566,1520),0),
    ('tree','image14.png',(51,300,482,918),0),
    ('flowerGold','image14.png',(1071,212,1274,488),0),
    ('flowerSecond','image14.png',(1292,279,1482,526),0),
    ('flowerLocked','image14.png',(1146,502,1330,692),0),
    ('flowerGlobe','image4.png',(1814,560,1972,734),0),
    ('world','image4.png',(1723,273,2000,542),0),
    ('bookOrange','image4.png',(1548,800,1657,979),0),
    ('bookBlue','image4.png',(1668,803,1762,977),0),
    ('bookGreen','image4.png',(1773,805,1864,978),0),
    ('bookPink','image4.png',(1881,805,1978,978),0),
    ('stamp','image3.png',(1339,696,1465,779),24),
    ('stampKyoto','image3.png',(1074,696,1198,779),24),
    ('stampKamakura','image3.png',(1205,696,1331,779),24),
    ('tape','image7.png',(1928,510,1988,553),0),
    ('stickerHappy','image3.png',(1070,585,1131,643),22),
    ('stickerCool','image3.png',(1240,585,1301,643),22),
    ('stickerCry','image3.png',(1327,585,1385,643),22),
    ('stickerLove','image3.png',(1413,585,1466,643),22),
    ('morning','image14.png',(577,516,709,660),0),
    ('friendsDinner','image14.png',(577,712,709,855),0),
]
assets = []
for key, source_name, box, threshold in fragments:
    source = Image.open(MEDIA / source_name)
    result = source.crop(box)
    if threshold:
        result = cut_cream(result, threshold)
    # Remove text areas from illustrative source fragments. Captions remain native UI.
    if key in ('tree', 'flowerGold', 'flowerSecond', 'flowerLocked'):
        data = np.array(result.convert('RGBA'))
        removals = {
            'tree': [(0, 72, 107, 117), (320, 131, 431, 180), (330, 328, 431, 375), (15, 354, 128, 406), (125, 439, 328, 486)],
            'flowerGold': [(20, 230, 180, 258)],
            'flowerSecond': [(13, 210, 180, 243)],
            'flowerLocked': [(9, 125, 174, 183), (148, 0, 184, 34)],
        }[key]
        # Transparent source cutouts allow live text pills over the source art.
        for left, top, right, bottom in removals:
            data[top:bottom, left:right, 3] = 0
        result = Image.fromarray(data)
    if key == 'world':
        # Retain the supplied hill, orange mascot and clouds, discard the UI panel.
        mask = Image.new('L', result.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.polygon([(0,231),(14,187),(33,159),(59,143),(84,130),(116,119),(142,118),(177,127),(211,149),(240,145),(267,174),(277,225),(268,254),(245,268),(25,268),(0,258)], fill=255)
        draw.ellipse((91,38,215,167), fill=255)
        draw.ellipse((94,32,127,68), fill=255)
        draw.ellipse((168,32,205,72), fill=255)
        draw.ellipse((125,5,157,31), fill=255)
        draw.ellipse((151,6,180,31), fill=255)
        draw.rectangle((143,21,161,49), fill=255)
        draw.ellipse((22,111,57,143), fill=255)
        draw.ellipse((32,94,54,127), fill=255)
        draw.ellipse((50,112,76,139), fill=255)
        draw.ellipse((12,147,34,180), fill=255)
        draw.ellipse((220,89,253,136), fill=255)
        draw.rectangle((227,117,236,153), fill=255)
        draw.polygon([(241,143),(259,139),(274,151),(273,163),(260,172),(244,161)], fill=255)
        result = result.convert('RGBA')
        result.putalpha(mask.filter(ImageFilter.GaussianBlur(.5)))
    if key == 'mascot':
        data = np.array(result.convert('RGBA'))
        data[:60, :155, 3] = 0
        result = Image.fromarray(data)
    if key == 'mascotCamera':
        # Clip the neighboring food photograph along the mascot's supplied sticker edge.
        data = np.array(result.convert('RGBA'))
        h, w = data.shape[:2]
        yy, xx = np.mgrid[:h, :w]
        leaf = ((xx-92)/26)**2 + ((yy-30)/30)**2 <= 1
        leaf |= ((xx-140)/36)**2 + ((yy-31)/25)**2 <= 1
        ear = ((xx-47)/21)**2 + ((yy-83)/29)**2 <= 1
        ear |= ((xx-176)/22)**2 + ((yy-88)/28)**2 <= 1
        body = ((xx-108)/107)**2 + ((yy-156)/107)**2 <= 1
        mask = leaf | ear | body | ((xx>=97)&(xx<=127)&(yy>=25)&(yy<=78))
        data[~mask, 3] = 0
        result = Image.fromarray(data)
    filename = key + '.png'
    result.save(ASSETS / filename)
    assets.append({'key': key, 'file': 'assets/reference/' + filename, 'source': source_name, 'source_size_px': source.size, 'crop_px': box, 'size_px': result.size, 'edge_cream_removed': bool(threshold)})

(REF / 'page-index.json').write_text(json.dumps(page_records, indent=2, ensure_ascii=False)+'\n')
(ROOT / 'docs/business/asset-manifest.json').write_text(json.dumps({'source': PPT.name, 'policy': 'Native-resolution crops from PPT media. No synthesized or external image sources.', 'assets': assets}, ensure_ascii=False, indent=2)+'\n')
lines = ['/** Native-resolution artwork extracted from AI日记设计图04.pptx. */', 'export const art = {']
for item in assets:
    lines.append(f"  {item['key']}: require('../../{item['file']}'),")
lines.extend(['} as const;', '', 'export type ArtName = keyof typeof art;', ''])
(ROOT / 'src/theme/assets.ts').write_text('\n'.join(lines))
print(f'Extracted {len(page_records)} reference pages and {len(assets)} image fragments.')
