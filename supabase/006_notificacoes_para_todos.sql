-- Migração aditiva OneSignal: todos os perfis podem optar pelas notificações.
-- Executar após 005_notificacoes_onesignal.sql; não apaga inscrições nem logs.
ALTER TABLE public.push_dispositivos ALTER COLUMN loja_id DROP NOT NULL;
ALTER TABLE public.push_dispositivos ADD COLUMN IF NOT EXISTS consentimento_em timestamptz;
ALTER TABLE public.push_dispositivos ALTER COLUMN autorizado SET DEFAULT false;
-- Inscrições antigas só recebem após nova confirmação explícita no navegador.
CREATE INDEX IF NOT EXISTS idx_push_consentimento_ativo
  ON public.push_dispositivos(ativo, autorizado, usuario_id)
  WHERE ativo AND autorizado AND consentimento_em IS NOT NULL;
