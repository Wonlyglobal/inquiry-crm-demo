#!/usr/bin/env python3
"""Prepare a bounded internal-only import bundle from existing authorized minimal reports.
No network, credentials, customer records or model calls. Output must stay in the private workspace.
"""
import argparse
import hashlib
import json
import datetime
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', required=True, type=Path)
parser.add_argument('--date', required=True)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
datetime.date.fromisoformat(args.date)
out = args.output.resolve()
if 'agent-intelligence-private' not in out.parts:
    raise SystemExit('Output must remain under agent-intelligence-private')
if any((p / '.git').exists() for p in [out.parent, *out.parents]):
    raise SystemExit('Refusing to write an internal report into a Git checkout')

def load(name):
    raw = (args.source_dir / name).read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()

day, day_hash = load(args.date + '-run.json')
week_file = args.source_dir / (args.date + '-weekly.json')
week, week_hash = load(week_file.name) if week_file.exists() else (None, None)

def body(value):
    return json.dumps(value, ensure_ascii=False, indent=2)

def section(title, value):
    text = value if isinstance(value, str) else body(value)
    if len(text) > 3000:
        raise ValueError('Report section exceeds limit; split the source report first')
    return {'title': title, 'body': text}

evidence = []
for s in day.get('public_sources', []):
    url = s['url']
    evidence.append({
        'id': 'source-' + hashlib.sha256(url.encode()).hexdigest()[:16],
        'title': '公开来源核验：' + url.split('/')[2],
        'fact': s.get('fact') or ('获取状态：' + s['status'] + '；' + s.get('scope', '仅目录或索引可读，不代表全文核验')),
        'inference': s.get('inference', '未据此推断没有变化或产生经营影响'),
        'url': url, 'published_at': s.get('publication_date'),
        'observed_at': s['checked_at'],
        'gap': s.get('scope') or '未取得完整发布日期/全文/规格或市场关联证据；不能当作今日新品或已匹配竞品',
    })
if len(evidence) > 12:
    raise ValueError('More than 12 sources; split the evidence batch')

def document(key, kind, title, generated, period, sections, sha):
    return {'schema': 'grace-private-intelligence-v1', 'key': key, 'kind': kind,
            'title': title, 'generated_at': generated, 'period': period,
            'sections': sections, 'evidence': evidence, 'source_sha256': sha,
            'human_verified': False}

if week:
    start, end = week['period'].split('/')
    period = {'from': start, 'to': end}
    weekly_sections = [
        section('上周经营汇总及口径', week['internal_business']),
        section('Brian：风险与下一步', week['brian']),
        section('优先动作及验证指标', week['priorities']),
        section('公开证据覆盖缺口', week['grace']['coverage_limit']),
        section('SEO与社媒数据日期', {'seo': day['seo'], 'social': day['social']}),
        section('产品资料覆盖与核验限制', day['materials']),
        section('知识边界', '自动汇总不是人工批准的产品事实、市场份额、员工评价或业务决定；未知/缺失不计为零。导入时间不替代来源日期，历史存量不作上周新增。'),
    ]
daily_crm = {k: day['crm'][k] for k in ['current_period', 'created', 'channels', 'active_opportunities', 'won', 'first_response_overdue', 'risk_or_overdue', 'overlap_not_deduplicated'] if k in day['crm']}
documents = []
if week:
    documents.append(document('weekly-' + start + '-' + end, 'weekly', 'Jay周报 ' + start + '—' + end, week['prepared_at'], period, weekly_sections, week_hash))
documents += [
    document('daily-' + args.date, 'daily', '智能体日报 ' + args.date, day['recorded_at'], {'from': args.date, 'to': args.date}, [
        section('本次读取时点的经营汇总（非单日实绩）', daily_crm),
        section('国家与产品研究范围', day['scope']),
        section('优先动作及验证指标', day['recommendations']),
        section('来源日期与缺口', {'seo': day['seo'], 'social': day['social']}),
        section('产品理解进度（非专家验收）', day['materials']),
    ], day_hash),
    document('evidence-' + args.date, 'evidence', '新增入库证据与来源状态 ' + args.date, day['recorded_at'], {'from': args.date, 'to': args.date}, [
        section('新增入库不等于新发生的事件', '本包保存本次实际核验的来源状态。未新增已核验重大事件；页面部分可读或失败不表示没有变化。产品目录无发布日期，不作近期新品。'),
    ], day_hash),
]
payload = json.dumps({'schema': 'grace-private-intelligence-bundle-v1', 'documents': documents}, ensure_ascii=False, indent=2).encode()
if len(payload) > 262144:
    raise ValueError('Bundle exceeds 256KB')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(payload)
print(json.dumps({'documents': len(documents), 'sources_per_document': len(evidence), 'bytes': len(payload), 'file_sha256': hashlib.sha256(payload).hexdigest()}))
