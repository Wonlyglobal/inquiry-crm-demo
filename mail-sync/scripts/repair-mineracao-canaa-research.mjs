import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase service configuration');

const db = createClient(url, key, { auth: { persistSession: false } });
const reason = '修正公共邮箱被误判为公司域名，并用公司名称、国家、CNPJ、联系人及企业邮件域名公开证据补充背调';

const { data: inquiry, error: inquiryError } = await db
  .from('inquiries')
  .select('id,inquiry_no,created_at,company_id,contact_name,demand_summary,original_message,email_intake(sender_email,received_at),companies(*)')
  .eq('inquiry_no', 2)
  .single();
if (inquiryError) throw inquiryError;
if (!inquiry.company_id || inquiry.companies?.name !== 'Mineracao Canaa') throw new Error('Unexpected inquiry/company identity');
if (inquiry.companies.domain && inquiry.companies.domain !== 'gmail.com') throw new Error('Company domain was already changed; refusing to overwrite');

const before = inquiry.companies;
const evidenceDate = '2026-09-03';
const officialLicense = 'https://sistemas.meioambiente.mg.gov.br/licenciamento/site/view-externo?id=18938';
const registryEvidence = 'https://casadosdados.com.br/solucao/cnpj/mineracao-canaa-industria-e-comercio-ltda-06260232000165';
const directoryEvidence = 'https://www.solutudo.com.br/empresas/mg/itabira/extracao-e-refino-de-minerais-nao-metalicos-fabricacao-de-produtos/mineracao-canaa-industria-e-comercio-ltda-11482752';
const receivedAt = inquiry.email_intake?.received_at || inquiry.created_at;
const contactEmail = inquiry.email_intake?.sender_email || '';

const companyUpdate = {
  domain: 'mineracaocanaa.com.br',
  country: 'Brasil',
  company_type: 'Extração de gemas / Gemstone mining',
  main_business: 'Extração de gemas (pedras preciosas e semipreciosas), apoio à extração de minerais não metálicos e transporte rodoviário de carga.',
  ai_summary: 'Mineracao Canaa Industria e Comercio Ltda（Canaan Pure Emerald）为巴西米纳斯吉拉斯州 Itabira 的矿业公司，CNPJ 06.260.232/0001-65。Rafael Bueno Guerra 与该主体存在公开关联。mineracaocanaa.com.br 有企业邮件记录，但官网当前无法访问，仍需在首次联系中核验项目身份及采购授权。',
  risk_level: 'medium',
  research_status: 'research_required',
  match_method: '公司名称 + 国家 + CNPJ + 联系人 + 企业邮件域名交叉匹配',
  match_confidence: 'medium',
  confirmed_facts: [
    { fact: '法定主体为 MINERACAO CANAA INDUSTRIA E COMERCIO LTDA，CNPJ 06.260.232/0001-65。', source_url: officialLicense, date: evidenceDate, confidence: '高' },
    { fact: '企业位于巴西 Minas Gerais 州 Itabira，主营宝石及半宝石开采。', source_url: officialLicense, date: evidenceDate, confidence: '高' },
    { fact: '公开企业资料使用 mineracaocanaa.com.br 企业邮件域名；该域名存在有效邮件 MX 记录。', source_url: registryEvidence, date: evidenceDate, confidence: '中' },
    { fact: 'Rafael Bueno Guerra 与该公司主体存在公开关联。', source_url: officialLicense, date: evidenceDate, confidence: '高' },
  ],
  demand_signals: [{
    signal: '客户主动提交 Security Doors 官网询盘。',
    interpretation: '存在主动采购意向，但项目业主、规格、数量、预算和采购权限仍需核实。',
    source: '客户原始官网询盘',
    source_url: null,
    date: receivedAt,
    confidence: '高',
  }],
  likely_needs: [{ need: '矿区或工业设施用安全门；具体防护等级、尺寸、材质、数量及认证标准待客户确认。' }],
  risks_counterevidence: [
    { risk: '询盘联系人使用 Gmail，尚未通过企业邮箱完成身份验证。' },
    { risk: 'mineracaocanaa.com.br 当前无法正常打开，不能将网页内容作为已核验事实。' },
    { risk: '尚无公开证据证明该 Security Doors 需求对应已立项项目或联系人拥有采购决策权。' },
  ],
  research_contacts: [{ display: `${inquiry.contact_name || 'Rafael Bueno Guerra'}｜职务待核验｜${contactEmail}｜客户原始询盘联系人；公共邮箱，需二次验证` }],
  research_sales_brief: {
    why_now: '客户已主动询问 Security Doors，应尽快核验矿区/工业设施的使用场景、项目业主、规格、数量、预算、交期和决策链。',
    decision_summary: '公司主体与联系人关联已有公开证据；采购项目和联系人权限尚未确认。',
    recommended_angle: '从矿区与工业设施的防护等级、耐久性、认证和项目交付能力切入，先完成需求资格确认再报价。',
    questions_to_ask: ['最终用户和项目地点是什么？','需要何种防护等级、尺寸、材质和认证？','采购数量、预算和交期是什么？','谁负责技术确认与采购批准？'],
    materials_to_prepare: ['安全门产品选型表','相关认证与测试报告','矿业或工业项目案例','规格与报价信息清单'],
    next_best_action: '向 Rafael 核验企业身份、项目用途、规格、数量和采购决策链，并请求使用企业邮箱或提供公司签名信息。',
  },
  research_evidence_sources: [officialLicense, registryEvidence, directoryEvidence].map((sourceUrl) => ({ url: sourceUrl, captured_at: new Date().toISOString() })),
  source_updated_at: evidenceDate,
  researched_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const { data: saved, error: updateError } = await db
  .from('companies')
  .update(companyUpdate)
  .eq('id', inquiry.company_id)
  .select()
  .single();
if (updateError) throw updateError;

const { error: auditError } = await db.from('audit_logs').insert({
  actor_id: null,
  entity_type: 'company',
  entity_id: inquiry.company_id,
  action: 'company_research_corrected',
  before_data: before,
  after_data: saved,
  reason,
});
if (auditError) throw auditError;

console.log(JSON.stringify({
  inquiry_no: inquiry.inquiry_no,
  company: saved.name,
  domain: saved.domain,
  research_status: saved.research_status,
  match_confidence: saved.match_confidence,
  confirmed_facts_count: saved.confirmed_facts?.length || 0,
  demand_signals_count: saved.demand_signals?.length || 0,
  evidence_sources_count: saved.research_evidence_sources?.length || 0,
  audited: true,
}));

