-- Persist bilingual WhatsApp translations so realtime refreshes do not repeat AI work.
alter table public.whatsapp_messages
  add column if not exists translation_zh text,
  add column if not exists translation_en text,
  add column if not exists detected_language text,
  add column if not exists translated_at timestamptz;

comment on column public.whatsapp_messages.translation_zh is 'AI translation in Simplified Chinese';
comment on column public.whatsapp_messages.translation_en is 'AI translation in English';

notify pgrst, 'reload schema';
