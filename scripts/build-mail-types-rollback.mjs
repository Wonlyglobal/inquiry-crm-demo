// Compose an all-or-nothing DDL + synthetic SQL acceptance transaction, never commit it.
import {readFile,writeFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261023123000_sales_mail_types.sql',import.meta.url),'utf8');
const tests=await readFile(new URL('../tests/sales-mail-types-rollback.sql',import.meta.url),'utf8');
if(!/commit;\s*$/.test(migration)||!process.argv[2])throw new Error('Expected final commit and output path');
await writeFile(process.argv[2],migration.replace(/commit;\s*$/,()=>tests+'\nrollback;\n'),{mode:0o600});
