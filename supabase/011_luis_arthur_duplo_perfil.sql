-- V18: um login, dois modos de acesso, sem copiar ou expor a senha.
-- Conta alvo: Luis Arthur, Loja 151. Transação interrompe se não existir uma única correspondência.
-- Antes de executar: faça backup e confira nome/loja do usuário no Supabase.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS acesso_geral boolean NOT NULL DEFAULT false;
ALTER TABLE public.sessoes ADD COLUMN IF NOT EXISTS modo_acesso text NOT NULL DEFAULT 'admin';
ALTER TABLE public.sessoes ADD COLUMN IF NOT EXISTS modo_expira_em timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sessoes_modo_acesso_check') THEN
    ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_modo_acesso_check CHECK(modo_acesso IN ('admin','geral'));
  END IF;
END $$;
DO $$
DECLARE alvo_id uuid; qtd integer;
BEGIN
  SELECT count(*) INTO qtd FROM public.usuarios
    WHERE nome_normalizado='luis arthur' AND loja_id='151' AND ativo=true AND perfil IN ('admin','funcionario');
  SELECT id INTO alvo_id FROM public.usuarios
    WHERE nome_normalizado='luis arthur' AND loja_id='151' AND ativo=true AND perfil IN ('admin','funcionario')
    LIMIT 1;
  IF qtd<>1 THEN
    RAISE EXCEPTION 'Não foi possível identificar uma única conta ativa Luis Arthur na Loja 151 (encontradas: %). Operação cancelada sem alterações.',qtd;
  END IF;
  UPDATE public.usuarios SET perfil='admin',acesso_geral=true,atualizado_em=now()
    WHERE id=alvo_id;
  -- Forçar novo login: nenhuma sessão antiga ganha poderes adicionais automaticamente.
  DELETE FROM public.sessoes WHERE usuario_id=alvo_id;
  RAISE NOTICE 'Perfil duplo ativado para conta % da Loja 151. Faça login novamente.',alvo_id;
END $$;
-- Habilita troca de PIN da mesma conta quando estiver no modo Geral.
CREATE OR REPLACE FUNCTION public.alterar_pin_geral(
  p_usuario uuid, p_sessao_hash text, p_pin_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_perfil text; v_duplo boolean;
BEGIN
  SELECT perfil,acesso_geral INTO v_perfil,v_duplo FROM public.usuarios
  WHERE id=p_usuario AND ativo=true FOR UPDATE;
  IF NOT (v_perfil='geral' OR (v_perfil='admin' AND v_duplo=true)) THEN
    RAISE EXCEPTION 'Conta não autorizada a trocar o PIN nesta rotina';
  END IF;
  IF p_pin_hash IS NULL OR length(p_pin_hash)>300 OR p_pin_hash NOT LIKE 'scrypt$%' THEN
    RAISE EXCEPTION 'Hash inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sessoes
    WHERE usuario_id=p_usuario AND token_hash=p_sessao_hash AND expira_em>now()) THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  UPDATE public.usuarios SET pin_hash=p_pin_hash,tentativas=0,bloqueado_ate=NULL WHERE id=p_usuario;
  DELETE FROM public.sessoes WHERE usuario_id=p_usuario AND token_hash<>p_sessao_hash;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.alterar_pin_geral(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_pin_geral(uuid,text,text) TO service_role;
COMMIT;
