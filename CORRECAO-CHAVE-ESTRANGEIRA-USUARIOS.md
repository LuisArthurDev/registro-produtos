# Correção: HTTP 409 em mapa_lancamentos — funcionario_id ausente

O erro `23503` indica que um mapa apontou para um ID inexistente em `usuarios`.
O ID `82ea4c03-159b-5e31-bba3-91cea1b6c9cf` corresponde a **Altino**, loja 151,
no CSV privado preparado. Esse funcionário consta no CSV: a falha não exige apagar o mapa.

## Correção e retomada sem importar todo o catálogo novamente

1. No GitHub, atualize `scripts/importar_dados.py` e `.github/workflows/migracao-supabase.yml`.
2. GitHub → Actions → **Supabase - preparar e importar** → Run workflow:
   - **etapa:** `importar`
   - **escopo:** `usuarios`
   - **confirmar_gravacao:** `true`
   - **pular_usuarios:** `false`
3. Depois de concluída a importação de usuários, execute novamente:
   - **etapa:** `importar`
   - **escopo:** `operacionais`
   - **confirmar_gravacao:** `true`
   - **pular_usuarios:** `false` (não tem efeito em `operacionais`)
4. Se a segunda etapa passar, execute **etapa `finalizar`** para associar os produtos e conferir as contagens.

`operacionais` importa apenas os mapas, vencidos, Queima e auditoria; não reenvia os 82.498 produtos já inseridos nem as 474 pendências do catálogo. Os conflitos são ignorados com os identificadores de origem para evitar duplicação quando a importação é reexecutada.

## O que mudou

- Antes de importar os mapas, o script consulta `usuarios` no Supabase e **usa os IDs de fato gravados**, mesmo quando diferem dos UUIDs calculados a partir dos nomes.
- Se uma conta estiver faltando, o script interrompe a importação **antes de enviar mapas**, com instruções para migrar usuários. Não cria funcionários fictícios.
- No escopo `usuarios`, o importador acrescenta **somente contas ausentes**. Contas e hashes de PIN já existentes não são sobrescritos.
- PINs iniciais são gerados somente para contas novas e distribuídos como artefato GPG criptografado pelo workflow.
- Se o mesmo funcionário tiver registro de mapa em mais de uma loja, cada loja é vinculada à conta correta.

**Não** execute novamente `estrutura` nem limpe tabelas. **Mantenha** `MIGRATION_PIN_SEED` e `PINS_PASSPHRASE` consistentes. Antes de compartilhar PINs, confira quais contas foram criadas nessa execução: usuários já existentes mantêm seus PINs originais.

## Conferência no SQL Editor do Supabase

```sql
select nome, loja_id, ativo, id
from public.usuarios
where loja_id = '151' and nome_normalizado = 'altino';

select count(*) as produtos from public.produtos;
select count(*) as mapas from public.mapa_lancamentos;
select count(*) as usuarios from public.usuarios;
```

Se `Altino` não aparecer antes da correção, o primeiro workflow deve criá-lo. Se já existir com outro UUID, o importador atualizado associa os mapas ao UUID existente. Se a criação de usuários falhar, não force inserções manuais sem verificar a causa.
