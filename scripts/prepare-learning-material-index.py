#!/usr/bin/env python3
"""Make an offline answer-key index from the original exam-template workbooks.

Requires openpyxl. Writes a private JSON bundle, never writes to a database.
"""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import zipfile

from openpyxl import load_workbook


SHEETS = ('单选题', '多选题', '判断题', '填空题', '简答题')
PREFIX = '学习题库行 '
UNIT = re.compile(r'[（(【]\s*[）)】]\s*(个工作日|个自然日|工作日|自然日|天|个月|年|小时|分钟|秒)')


def clean(cell):
    return re.sub(r'\s+', ' ', str(cell.value)).strip() if cell.value is not None else ''


def answer_values(sheet, cells, headers):
    if sheet in ('单选题', '多选题'):
        options = dict(zip(headers[3:15], cells[3:15]))
        keys = cells[2].upper()
        if re.fullmatch(r'[A-L]+', keys) and len(set(keys)) == len(keys) and (
            sheet == '多选题' or len(keys) == 1
        ) and all(options.get(key) for key in keys):
            return [options[key] for key in keys]
    if sheet == '判断题':
        return [cells[2]] if cells[2] in ('对', '错') else []
    if sheet == '填空题':
        blanks = [value for header, value in zip(headers[2:14], cells[2:14]) if re.fullmatch(r'空\d+', header)]
        while blanks and not blanks[-1]:
            blanks.pop()
        return blanks if all(blanks) else []
    # The template's short-answer columns contain grading keywords.
    return []


def index_workbook(path):
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Workbook exceeds the extraction limit')
    raw = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(raw) > 8 * 1024 * 1024 or sum(x.file_size for x in archive.infolist()) > 32 * 1024 * 1024:
            raise ValueError('Workbook exceeds the extraction limit')
    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True, keep_links=False)
    try:
        if tuple(workbook.sheetnames) != SHEETS:
            raise ValueError('Unexpected exam workbook layout')
        pages, skipped = [], 0
        for page, title in enumerate(SHEETS, 1):
            rows = workbook[title].iter_rows(min_row=2, max_col=15)
            columns = [clean(c) for c in next(rows)]
            headers = [clean(c) for c in next(rows)]
            if columns[:2] != ['序号', '题目']:
                raise ValueError('Unexpected question columns')
            chunks, seen = [], set()
            for row_number, row in enumerate(rows, 4):
                cells = [clean(c) for c in row]
                if not cells[1]:
                    continue
                number = re.fullmatch(r'([1-9]\d{0,2})(?:\.0)?', cells[0])
                if not number or number[1] in seen:
                    raise ValueError('Invalid or duplicate question number')
                seen.add(number[1])
                values = answer_values(title, cells, headers)
                unit = UNIT.search(cells[1])
                record = {'row': row_number, 'values': values}
                if unit and len(values) == 1 and re.fullmatch(r'\d+(?:\.\d+)?', values[0]):
                    record['unit'] = unit[1]
                chunk = PREFIX + f'{title}第{number[1]}题｜' + json.dumps(record, ensure_ascii=False, separators=(',', ':'))
                if not values or len(chunk) > 850 or any(len(v) > 400 for v in values):
                    skipped += 1
                    continue
                chunks.append(chunk)
            pages.append(dict(page=page, location=title, kind='sheet_cells', chunks=chunks,
                              facts=[], ocr_status='not_applicable', truncated=False, has_text=bool(chunks)))
    finally:
        workbook.close()
    count = sum(len(page['chunks']) for page in pages)
    if not count:
        raise ValueError('No usable answer-key rows')
    index = dict(schema='document-evidence-v1', status='partial' if skipped else 'ready',
                 sha256=hashlib.sha256(raw).hexdigest(), pages_total=len(SHEETS), pages_processed=len(SHEETS),
                 pages_with_text=sum(p['has_text'] for p in pages), human_verified=False,
                 warnings=['仅提取学习题库的答案栏，跳过无法可靠确定答案的题目。'] if skipped else [], pages=pages)
    # Keep the existing document worker from classifying exam answers as product specifications.
    index['knowledge_profile'] = dict(schema='evidence-profile-v2', method='offline_extractive_rules',
                                      source_sha256=index['sha256'], human_verified=False,
                                      summary=[], series=[], models=[], parameters=[], categories=[], document_types=[],
                                      languages=['zh'])
    return dict(name=path.name, bytes=len(raw), indexed_questions=count, skipped_questions=skipped, document=index)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if any((parent / '.git').exists() for parent in output.parents):
        parser.error('Write the internal bundle outside Git')
    books = [index_workbook(path) for path in sorted(args.source_dir.glob('*.xlsx'))]
    if not books:
        parser.error('No workbooks found')
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as target:
        json.dump(books, target, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(books)} files, {sum(book["indexed_questions"] for book in books)} indexed questions, '
          f'{sum(book["skipped_questions"] for book in books)} skipped')


if __name__ == '__main__':
    main()
