-- V24: pendências de EAN desconhecido em lançamentos reais, sem perder o registro.
-- Execute depois das migrações 001-015. Reexecutável e não remove registros.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lancamento_pendencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lancamento_id uuid NOT NULL UNIQUE REFERENCES public.mapa_lancamentos(id) ON DELETE CASCADE,
 loja_id text NOT NULL REFERENCES public.lojas(id),
 ean text NOT NULL,
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','ignorada','resolvida')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 ignorado_em timestamptz,
 ignorado_por uuid REFERENCES public.usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_lancamento_pendencias_loja_status ON public.lancamento_pendencias(loja_id,status);
ALTER TABLE public.lancamento_pendencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lancamento_pendencias FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamento_pendencias TO service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_pendencia_ean_lancamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_existe boolean; v_estado text; v_ean_anterior text;
BEGIN
 IF new.excluido_em IS NOT NULL THEN
   UPDATE public.lancamento_pendencias SET status='resolvida',atualizado_em=now()
   WHERE lancamento_id=new.id AND status='pendente';
   RETURN new;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=new.ean) INTO v_existe;
 IF v_existe THEN
   UPDATE public.lancamento_pendencias SET status='resolvida',atualizado_em=now()
   WHERE lancamento_id=new.id AND status='pendente';
 ELSE
   SELECT status,ean INTO v_estado,v_ean_anterior FROM public.lancamento_pendencias WHERE lancamento_id=new.id;
   IF v_estado='ignorada' AND v_ean_anterior=new.ean THEN RETURN new; END IF;
   INSERT INTO public.lancamento_pendencias(lancamento_id,loja_id,ean,status)
   VALUES(new.id,new.loja_id,new.ean,'pendente')
   ON CONFLICT (lancamento_id) DO UPDATE SET ean=excluded.ean,loja_id=excluded.loja_id,
     status='pendente',atualizado_em=now(),ignorado_em=NULL,ignorado_por=NULL;
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS tg_pendencia_ean_lancamento ON public.mapa_lancamentos;
CREATE TRIGGER tg_pendencia_ean_lancamento AFTER INSERT OR UPDATE OF ean,produto_id,excluido_em
ON public.mapa_lancamentos FOR EACH ROW EXECUTE FUNCTION public.sincronizar_pendencia_ean_lancamento();

CREATE OR REPLACE FUNCTION public.resolver_pendencias_ao_cadastrar_ean()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.lancamento_pendencias SET status='resolvida',atualizado_em=now()
 WHERE ean=new.ean AND status='pendente';
 UPDATE public.mapa_lancamentos SET produto_id=new.id
 WHERE ean=new.ean AND produto_id IS NULL;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS tg_resolver_ean_catalogo ON public.produtos;
CREATE TRIGGER tg_resolver_ean_catalogo AFTER INSERT OR UPDATE OF ean ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.resolver_pendencias_ao_cadastrar_ean();

-- Recupera pendências dos lançamentos anteriores à instalação deste gatilho.
INSERT INTO public.lancamento_pendencias(lancamento_id,loja_id,ean,status)
SELECT m.id,m.loja_id,m.ean,'pendente' FROM public.mapa_lancamentos m
WHERE m.excluido_em IS NULL AND NOT EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=m.ean)
ON CONFLICT(lancamento_id) DO NOTHING;
COMMIT;
