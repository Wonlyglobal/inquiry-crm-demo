import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const modules=[...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
if(!modules.length)throw new Error('No browser modules found');
const directory=await mkdtemp(join(tmpdir(),'crm-syntax-'));
try{
  for(const [index,source] of modules.entries()){
    const file=join(directory,`${index}.mjs`);await writeFile(file,source);
    const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error('Browser module syntax check failed');
  }
  console.log(`Checked ${modules.length} browser module(s)`);
}finally{await rm(directory,{recursive:true,force:true})}
