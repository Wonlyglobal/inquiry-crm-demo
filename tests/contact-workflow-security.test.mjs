import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20260916100000_lock_contacts_to_workflows.sql",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const rollback=await readFile(new URL("./production-contact-workflow-rollback.sql",import.meta.url),"utf8");

test("contact table mutations are locked to audited workflows",()=>{
  assert.match(migration,/drop policy if exists contacts_insert/);
  assert.match(migration,/drop policy if exists contacts_update/);
  assert.match(migration,/revoke insert,update,delete on public\.contacts from authenticated/);
  assert.match(migration,/create or replace function public\.set_customer_contact_avatar/);
  assert.match(migration,/actor_role in \('owner','sales_manager','marketing'\)/);
  assert.match(migration,/i\.owner_id=actor_id/);
  assert.match(migration,/o\.bucket_id='profile-avatars' and o\.name=normalized_path/);
  assert.match(migration,/contact_avatar_updated/);
  assert.match(migration,/revoke all on function public\.set_customer_contact_avatar\(uuid,text\) from public,anon/);
});

test("WhatsApp avatar upload uses the audited contact RPC",()=>{
  assert.match(html,/function waContactAvatarUrl\(value\)/);
  assert.match(html,/supabase\.rpc\("set_customer_contact_avatar",\{target_contact_id:conversation\.contactId,avatar_path:path\}\)/);
  assert.doesNotMatch(html,/from\("contacts"\)\.update\(\{avatar_url:/);
  assert.match(html,/profile-avatars/);
});

test("production contact acceptance is transactionally rolled back",()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/set_customer_contact_avatar/);
  assert.match(rollback,/CONTACT_AVATAR_AUDIT_MISSING/);
  assert.match(rollback,/^rollback;/m);
  assert.match(rollback,/authenticated_insert=/);
  assert.match(rollback,/authenticated_update=/);
});
