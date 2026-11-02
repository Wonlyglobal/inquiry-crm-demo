// Keep the Edge bundle self-contained so official source download can verify it.
// Canonical browser modules remain in assets; CI rejects stale copies.
import {readFile,writeFile} from 'node:fs/promises';
for(const name of ['outreach-research-plan.mjs','website-signal-contract.mjs'])await writeFile(new URL('../supabase/functions/_shared/'+name,import.meta.url),await readFile(new URL('../assets/'+name,import.meta.url)));
