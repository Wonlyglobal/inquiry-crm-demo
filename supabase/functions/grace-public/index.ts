import { createPublicHttp } from './http.mjs';

const projectRef = Deno.env.get('GRACE_PUBLIC_PROJECT_REF');
const projectUrl = Deno.env.get('SUPABASE_URL');
if (projectUrl !== `https://${projectRef}.supabase.co`) throw new Error('Public project mismatch');
Deno.serve(createPublicHttp({
  projectRef,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  modelKey: Deno.env.get('GRACE_PUBLIC_DASHSCOPE_KEY'),
}));
