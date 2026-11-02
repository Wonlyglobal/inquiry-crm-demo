const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withSafeReadRetries(fetchImpl = globalThis.fetch, { retries = 2, baseDelayMs = 250 } = {}) {
  return async (input, init = {}) => {
    const requestMethod = String(
      init.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET'),
    ).toUpperCase();
    if (requestMethod !== 'GET' && requestMethod !== 'HEAD') return fetchImpl(input, init);

    for (let attempt = 0; ; attempt += 1) {
      try {
        const retryInput = typeof Request !== 'undefined' && input instanceof Request ? input.clone() : input;
        return await fetchImpl(retryInput, init);
      } catch (error) {
        const code = error?.cause?.code;
        if (!(error instanceof TypeError) || !RETRYABLE_NETWORK_CODES.has(code) || attempt >= retries) throw error;
        await sleep(baseDelayMs * (2 ** attempt));
      }
    }
  };
}

export { withSafeReadRetries };
