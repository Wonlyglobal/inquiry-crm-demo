// Decode locally before parsing or sending rows to the existing import RPC.
export function decodeCustomerCsv(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const decode = encoding => {
    const text = new TextDecoder(encoding, {fatal:true}).decode(bytes);
    if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('invalid CSV text');
    return text.replace(/^\uFEFF/, '');
  };
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be'
    : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8' : null;
  for (const encoding of bom ? [bom] : ['utf-8', 'gb18030']) {
    try { return decode(encoding); } catch { /* Try only a lossless supported decoding. */ }
  }
  throw new Error('CSV 编码无法识别或文件已含乱码，尚未导入。请从原始表格另存为“CSV UTF-8（逗号分隔）”后重试；不要直接保存已经乱码的文件。');
}
export async function readCustomerCsv(file) {
  return decodeCustomerCsv(await file.arrayBuffer());
}
