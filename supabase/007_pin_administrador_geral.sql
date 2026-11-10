-- Troca de PIN do próprio Administrador Geral, de forma transacional.
-- Executar após 001_schema.sql. A API verifica o PIN atual e gera hash scrypt.
-- Nunca transmitir PINs em texto puro ao PostgreSQL.
CREATE OR REPLACE FUNCTION public.alterar_pin_geral(
  p_usuario uuid, p_sessao_hash text, p_pin_hash text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_perfil text;
BEGIN
  SELECT perfil INTO v_perfil FROM public.usuarios WHERE id=p_usuario AND ativo=true FOR UPDATE;
  IF v_perfil IS DISTINCT FROM 'geral' THEN
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
