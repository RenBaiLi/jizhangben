# -*- coding: utf-8 -*-
"""把 PWA 打包成单文件 HTML(微信/QQ 发到手机直接用浏览器打开)"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), '记账本.html')


def read(p):
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


html = read(os.path.join(ROOT, 'index.html'))
appjs = read(os.path.join(ROOT, 'app.js'))

# 图标转 data URI 作 favicon(file:// 下 manifest/安装本来就用不了,只留图标)
icon_path = os.path.join(ROOT, 'icons', 'icon-192.png')
with open(icon_path, 'rb') as f:
    icon_b64 = base64.b64encode(f.read()).decode('ascii')
icon_uri = 'data:image/png;base64,' + icon_b64

# 去掉 manifest 链接(file:// 下无意义),图标换 data URI
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>',
              '<link rel="apple-touch-icon" href="%s">' % icon_uri, html)
html = re.sub(r'<link rel="icon"[^>]*>',
              '<link rel="icon" href="%s">' % icon_uri, html)

# app.js 内联(</script> 转义防提前闭合)
inline_js = appjs.replace('</script', '<\\/script')
html = html.replace('<script src="app.js"></script>',
                    '<script>\n' + inline_js + '\n</script>')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('OK ->', OUT, '(%.1f KB)' % (os.path.getsize(OUT) / 1024))
