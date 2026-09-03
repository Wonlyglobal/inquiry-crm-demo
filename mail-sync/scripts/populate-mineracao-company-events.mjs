import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase service configuration');
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: inquiry, error: inquiryError } = await db
  .from('inquiries')
  .select('id,inquiry_no,company_id,companies(*)')
  .eq('inquiry_no', 2)
  .single();
if (inquiryError) throw inquiryError;
if (!inquiry.company_id || inquiry.companies?.domain !== 'mineracaocanaa.com.br') throw new Error('Unexpected company identity');

const beforeBrief = inquiry.companies.research_sales_brief || {};
const onlineEvents = [
  {
    id: 'mineracao-canaa-founded-2004',
    date: '2004-04-20',
    type: 'other',
    kind: 'fact',
    title: 'Mineracao Canaa Industria e Comercio Ltda 成立',
    summary: '公开企业登记资料显示，公司于 2004 年 4 月 20 日成立，CNPJ 为 06.260.232/0001-65，所在地为 Itabira, Minas Gerais。',
    impact: '证明公司主体长期存在，但成立事件本身不构成本次 Security Doors 采购证据。',
    relation: 'none',
    relation_reason: '时间早于本次询盘二十余年，且登记事项未涉及门、锁或当前采购项目。',
    source_url: 'https://casadosdados.com.br/solucao/cnpj/mineracao-canaa-industria-e-comercio-ltda-06260232000165',
    confidence: '高',
    origin: 'research',
  },
  {
    id: 'mineracao-canaa-license-2020',
    date: '2020-04-24',
    type: 'project',
    kind: 'fact',
    title: '矿业项目运营许可获批',
    summary: '米纳斯吉拉斯州环境许可系统记录该公司在 Itabira 的矿业经营许可续期决定获批。',
    impact: '持续运营的矿业设施可能存在工业安全门、防护门和出入口安全需求，但公开许可材料没有直接提到本次产品。',
    relation: 'possible',
    relation_reason: '事件证明矿业设施持续运营，与工业安防场景存在合理关联；但距离询盘时间较远，也没有门类采购、规格或项目名称证据。',
    source_url: 'https://sistemas.meioambiente.mg.gov.br/licenciamento/site/view-externo?id=18938',
    confidence: '高',
    origin: 'research',
  },
];

const retainedManualEvents = (beforeBrief.company_events || []).filter((event) => event?.origin === 'manual');
const afterBrief = { ...beforeBrief, company_events: [...retainedManualEvents, ...onlineEvents] };
const { data: saved, error: updateError } = await db.from('companies')
  .update({ research_sales_brief: afterBrief, updated_at: new Date().toISOString() })
  .eq('id', inquiry.company_id)
  .select('id,research_sales_brief')
  .single();
if (updateError) throw updateError;

const reason = '按公开网络关键时间重建公司大事件，并逐条判断与 #000002 Security Doors 询盘的关联程度';
const { error: auditError } = await db.from('audit_logs').insert({
  actor_id: null,
  entity_type: 'company',
  entity_id: inquiry.company_id,
  action: 'company_events_online_research',
  before_data: { company_events: beforeBrief.company_events || [] },
  after_data: { company_events: saved.research_sales_brief?.company_events || [] },
  reason,
});
if (auditError) throw auditError;

console.log(JSON.stringify({ inquiry_no: inquiry.inquiry_no, online_events: onlineEvents.length, manual_events_retained: retainedManualEvents.length, audited: true }));

