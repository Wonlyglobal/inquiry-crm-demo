// Keep the deployable Edge package self-contained and reproducible.
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
const source=new URL('../mail-sync/src/',import.meta.url);
const target=new URL('../supabase/functions/mail-sync-worker/runtime/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of await readdir(source))if(name.endsWith('.mjs'))await writeFile(new URL(name,target),await readFile(new URL(name,source)));
await writeFile(new URL('../supabase/functions/mail-sync-worker/deno.json',import.meta.url),await readFile(new URL('../mail-sync/deno.json',import.meta.url)));
