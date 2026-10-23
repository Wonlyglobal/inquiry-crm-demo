import {readFile,writeFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261023160000_sales_mail_review_queue.sql',import.meta.url),'utf8');
const checks=await readFile(new URL('../tests/sales-mail-review-rollback.sql',import.meta.url),'utf8');
if(!process.argv[2]||!/commit;\s*$/.test(migration))throw new Error('Expected output path / final commit');
await writeFile(process.argv[2],migration.replace(/commit;\s*$/,()=>checks+'\nrollback;\n'),{mode:0o600});
