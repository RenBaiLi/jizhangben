# -*- coding: utf-8 -*-
"""生成记账本 App 图标"""
import os

from PIL import Image, ImageDraw

GREEN = (47, 158, 68)
DARK = (255, 255, 255)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
os.makedirs(OUT, exist_ok=True)


def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=GREEN)
    u = size / 24.0
    # 笔记本轮廓
    d.rounded_rectangle([6 * u, 3.6 * u, 18 * u, 20.4 * u], radius=2.2 * u,
                        outline=DARK, width=max(1, int(1.5 * u)))
    # 书脊
    d.line([(9.2 * u, 3.6 * u), (9.2 * u, 20.4 * u)], fill=DARK, width=max(1, int(1.2 * u)))
    # 内容线(右侧两笔)
    d.line([(12 * u, 8.6 * u), (15.6 * u, 8.6 * u)], fill=DARK, width=max(1, int(1.1 * u)))
    d.line([(12 * u, 12 * u), (15.6 * u, 12 * u)], fill=DARK, width=max(1, int(1.1 * u)))
    # ¥ 左页
    cx, cy = 7.7 * u, 14.2 * u
    w = max(1, int(1.2 * u))
    d.line([(cx - 1.5 * u, cy - 2.2 * u), (cx, cy)], fill=DARK, width=w)
    d.line([(cx + 1.5 * u, cy - 2.2 * u), (cx, cy)], fill=DARK, width=w)
    d.line([(cx, cy), (cx, cy + 2.2 * u)], fill=DARK, width=w)
    d.line([(cx - 1.2 * u, cy - 0.3 * u), (cx + 1.2 * u, cy - 0.3 * u)], fill=DARK, width=w)
    d.line([(cx - 1.2 * u, cy + 0.9 * u), (cx + 1.2 * u, cy + 0.9 * u)], fill=DARK, width=w)
    return img


img512 = draw_icon(512)
img512.save(os.path.join(OUT, 'icon-512.png'))
img192 = img512.resize((192, 192), Image.LANCZOS)
img192.save(os.path.join(OUT, 'icon-192.png'))
img180 = img512.resize((180, 180), Image.LANCZOS)
img180.save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons ->', OUT)
