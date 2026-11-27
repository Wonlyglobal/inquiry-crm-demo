// Date is the original message timestamp; IMAP INTERNALDATE may be an import time.
export function originalMailTime(...values){
 for(const value of values){if(value===null||value===undefined||value==='')continue;const n=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;if(Number.isFinite(n))return new Date(n).toISOString()}
 return null;
}
