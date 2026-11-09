# Corrigir o erro `Network is unreachable` na etapa de estrutura do Supabase

## Por que acontece

O erro `connection to server at db.hmowljkqsulivrgbqvvt.supabase.co (2600:...), port 5432: Network is unreachable` ocorre porque a **conexão direta** ao PostgreSQL resolve para IPv6 e o runner do GitHub Actions não tem conectividade IPv6. **Não é erro do arquivo SQL.**

## Correção obrigatória no GitHub (secret)

1. No painel do **Supabase**, abra o projeto correspondente e clique em **Connect**.
2. Escolha **Session pooler** (pooler compartilhado; não o modo *Direct* nem o *Transaction pooler*).
3. Copie a connection string PostgreSQL na **porta `5432`**, completa com usuário e senha do banco.
4. A forma esperada é:

   `postgresql://postgres.hmowljkqsulivrgbqvvt:SENHA_DO_BANCO@HOST_FORNECIDO_PELO_SUPABASE:5432/postgres?sslmode=require`

   **Importante:** `HOST_FORNECIDO_PELO_SUPABASE` é um endereço real terminado em `.pooler.supabase.com`, exibido em **Connect**. Não adivinhe índice nem região. Use `postgres.<id_do_projeto>` como usuário e a senha do banco. Se a senha tiver `@`, `#`, `:`, `/` ou outros caracteres reservados, codifique-os na URL (percent-encoding).
5. No repositório GitHub, entre em **Settings → Secrets and variables → Actions → Repository secrets** e **edite `SUPABASE_DB_URL`** com a URL da etapa anterior.
6. Execute **Actions → Supabase - preparar e importar → Run workflow**, selecionando `etapa = estrutura`.

Não coloque senhas ou URLs completas em issues, prints, mensagens ou commits. O workflow atualizado imprime somente mensagens de diagnóstico, sem mostrar o segredo.

## O que foi atualizado

- `.github/workflows/migracao-supabase.yml` valida o formato da URL do Session pooler antes de executar SQL.
- A etapa `Testar conexão PostgreSQL sem alterar dados` roda um `SELECT 1` e informa claramente se o banco está acessível.
- `PGCONNECT_TIMEOUT=15` evita espera indefinida por conexão.

**Atenção:** o workflow não pode alterar o valor do secret por conta própria. Você **precisa atualizar `SUPABASE_DB_URL` manualmente no GitHub** mesmo depois de instalar este arquivo corrigido.

Documentação oficial: https://supabase.com/docs/guides/database/connecting-to-postgres
