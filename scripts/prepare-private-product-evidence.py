#!/usr/bin/env python3
"""Read a native PDF locally; write source-bound evidence only to a non-Git private directory.

No network or models. This is a conservative two-panel layout extractor, not OCR or
visual interpretation. Unsupported layouts and incomplete fields fail closed.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import re
from pathlib import Path


def canonical(value):
    import unicodedata
    return re.sub(r'[\s_/.-]+', '', unicodedata.normalize('NFKC', value)).upper()


def rect(words):
    return [round(min(w['x0'] for w in words), 4), round(min(w['top'] for w in words), 4),
            round(max(w['x1'] for w in words), 4), round(max(w['bottom'] for w in words), 4)]


def rows(words):
    groups = []
    for word in sorted(words, key=lambda w: (w['top'], w['x0'])):
        match = next((g for g in groups if abs(g[0]['top'] - word['top']) < 2), None)
        if match is None:
            groups.append([word])
        else:
            match.append(word)
    return [sorted(g, key=lambda w: w['x0']) for g in groups]


def extract_panel(page, model):
    if getattr(page, 'rotation', None) != 0:
        raise ValueError('Rotated native pages are unsupported')
    words = page.extract_words(extra_attrs=['size'])
    heading_rows = [r for side in [False, True] for r in rows([w for w in words if w['size'] >= 22 and (w['x0'] >= float(page.width)/2) == side])
                    if canonical(' '.join(w['text'] for w in r)) == canonical(model)]
    if len(heading_rows) != 1:
        return None
    heading_words = heading_rows[0]
    middle = float(page.width) / 2
    right = min(w['x0'] for w in heading_words) >= middle
    panel = [round(middle, 4) if right else 0, 0, round(float(page.width), 4) if right else round(middle, 4), round(float(page.height), 4)]
    selected = [w for w in words if w['x0'] >= panel[0] and w['x1'] <= panel[2]]
    # Crossing words/unknown model headings make panel ownership ambiguous.
    if any(w['x0'] < middle < w['x1'] for w in words):
        return None
    lines = rows(selected)
    large = rows([w for w in selected if w['size'] >= 22])
    product_headings = [r for r in large if re.search(r'(?<![A-Za-z0-9])[A-Za-z]{1,10}\d{1,6}', ' '.join(w['text'] for w in r))]
    if len(product_headings) != 1 or canonical(' '.join(w['text'] for w in product_headings[0])) != canonical(model):
        return None
    line_texts = [' '.join(w['text'] for w in r) for r in lines]
    text = '\n'.join(line_texts)
    if len(text) > 2550:
        return None
    heading = ' '.join(w['text'] for w in heading_words)
    if text.count(heading) != 1:
        return None
    hstart = text.index(heading)
    anchor = {'model': model, 'quote': heading, 'start': hstart, 'end': hstart + len(heading), 'bbox': rect(heading_words)}
    dimension = next((r[0]['top'] for r, t in zip(lines, line_texts) if re.fullmatch(r'Dimensions?', t, re.I)), None)
    key_features = next((r[0]['top'] for r, t in zip(lines, line_texts) if re.fullmatch(r'Key Features', t, re.I)), None)
    groups = []
    if dimension is not None:
        overview = [i for i, r in enumerate(lines) if r[0]['top'] > anchor['bbox'][3] + 4 and r[0]['top'] < dimension - 2]
        if overview:
            groups.append(('产品说明', overview))
    for i, t in enumerate(line_texts):
        if re.search(r'Door\s+thickness', t, re.I) and re.search(r'\d', t) and re.search(r'mm\b|cm\b|inch', t, re.I):
            groups.append(('门厚', [i]))
    if key_features is not None:
        features = [i for i, r in enumerate(lines) if key_features + 4 < r[0]['top'] < float(page.height) - 30]
        if features:
            groups.append(('功能说明', features))
    # Dropping later candidates could hide a conflicting configuration. Fail the
    # extraction rather than producing a valid-looking partial field selection.
    if len(groups) > 4:
        raise ValueError('Native panel field budget exceeded')
    regions = []
    for name, indexes in groups:
        if indexes != list(range(indexes[0], indexes[-1] + 1)):
            continue
        quote = '\n'.join(line_texts[i] for i in indexes)
        if not 1 <= len(quote) <= 500 or text.count(quote) != 1:
            continue
        start = text.index(quote)
        regions.append({'schema': 'native_region_v1', 'source_kind': 'native_text', 'page': page.page_number,
                        'page_width': round(float(page.width), 4), 'page_height': round(float(page.height), 4),
                        'coordinate_system': 'pdf_points_top_left', 'offset_unit': 'unicode_codepoint', 'rotation': 0, 'panel_bbox': panel,
                        'native_text': text, 'headings': [anchor],
                        'field': {'name': name, 'quote': quote, 'start': start, 'end': start + len(quote),
                                  'bbox': rect([w for i in indexes for w in lines[i]])},
                        'region_id': 'page-' + str(page.page_number) + ('-right' if right else '-left')})
    return regions


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--sha256', required=True)
    p.add_argument('--edition', required=True)
    p.add_argument('--model', action='append', required=True)
    p.add_argument('--output', required=True, type=Path)
    args = p.parse_args()
    out = args.output.resolve()
    if 'agent-intelligence-private' not in out.parts or any((a / '.git').exists() for a in out.parents):
        raise ValueError('Private output must remain outside a Git checkout')
    source = args.source.resolve()
    source_bytes = source.read_bytes()
    sha = hashlib.sha256(source_bytes).hexdigest()
    if sha != args.sha256 or not re.fullmatch('[a-f0-9]{64}', sha):
        raise ValueError('Original source hash mismatch')
    if len(args.model) > 5 or len(set(map(canonical, args.model))) != len(args.model):
        raise ValueError('Model count or identity invalid')
    import pdfplumber
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    day = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)).date().isoformat()
    docs = []
    with pdfplumber.open(io.BytesIO(source_bytes)) as pdf:
        for model in args.model:
            regions = []
            for page in pdf.pages:
                found = extract_panel(page, model)
                if found:
                    regions.extend(found)
            if not regions or len(regions) > 12 or len({r['page'] for r in regions}) > 6:
                raise ValueError('Native panel evidence missing or over budget')
            for r in regions:
                r['source_sha256'] = sha
            pe = {'schema': 'grace-product-page-evidence-v1', 'model': model, 'source_name': source.name,
                  'source_edition': args.edition, 'source_sha256': sha, 'source_published_at': None,
                  'source_updated_at': None, 'extracted_at': now, 'regions': regions,
                  'gaps': ['仅原生文字与双栏空间归属，图片、尺寸箭头、图标和性能实测未核验。',
                           '原文发布日期与实际现售配置未核验；导入和提取时间不作为发布日期。',
                           '机器原文摘录，未经人工产品核验；不证明当地准入、安装或商业适配。']}
            key = 'product-' + hashlib.sha256(('grace-product-page-evidence-v1|' + sha + '|' + canonical(model)).encode()).hexdigest()
            docs.append({'schema': 'grace-private-intelligence-v1', 'key': key, 'kind': 'product',
                         'title': model + ' 私有原生页区域证据', 'generated_at': now,
                         'period': {'from': day, 'to': day}, 'sections': [{'title': '产品证据边界', 'body': '仅保存授权产品原文区域，机器整理，未经人工事实核验；来源、型号、页码和配置需回查原件，不证明当前版次、认证或市场适配。'}],
                         'evidence': [], 'source_sha256': sha, 'human_verified': False, 'product_evidence': pe})
    raw = json.dumps({'schema': 'grace-private-intelligence-bundle-v1', 'documents': docs}, ensure_ascii=False, indent=2).encode()
    if len(raw) > 262144 or any(len(json.dumps(d, ensure_ascii=False).encode()) > 100000 for d in docs):
        raise ValueError('Private bundle over budget')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    print(json.dumps({'documents': len(docs), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                      'coverage': [{'model': d['product_evidence']['model'], 'pages': sorted({r['page'] for r in d['product_evidence']['regions']}),
                                    'fields': [r['field']['name'] for r in d['product_evidence']['regions']]} for d in docs]}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Private native extraction failed; original content omitted')
