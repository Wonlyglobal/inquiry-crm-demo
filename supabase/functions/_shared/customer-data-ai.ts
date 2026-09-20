/**
 * Customer threads, quotations and unclassified drafts default to L3.
 * There is currently no server-verified classification/exception approval store.
 * Never accept an approval flag from the request or an environment bypass.
 * This is deliberate fail-closed containment until that workflow exists.
 */
export function assertCustomerDataAiPolicy(): never {
  throw new Error('AI_DATA_POLICY_BLOCKED：客户资料与未分级业务内容尚未完成外部 AI 数据审批，暂不发送至外部模型。此结果不代表事实检查通过。');
}

export async function customerDataAiFetch(..._request: Parameters<typeof fetch>): Promise<Response> {
  return assertCustomerDataAiPolicy();
}
