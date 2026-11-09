# Recuperar o workflow no GitHub Actions

## O que foi ajustado

- O arquivo `.github/workflows/migracao-supabase.yml` mantém a execução manual (`workflow_dispatch`).
- Uma atualização desse workflow ou dos scripts de migração dispara automaticamente um **teste seguro** chamado `Verificar ativacao do workflow (sem banco)`.
- O job de importação permanece restrito a `workflow_dispatch`: **um push nunca executa importação ou modifica tabelas**.
- O teste automático verifica Python, arquivos necessários e o downloader sem acessar o Supabase.

## Instalação (importante)

1. Abra o repositório GitHub e confira qual é a **branch padrão** em `Settings > Branches` (geralmente `main`).
2. Confirme que o arquivo está em `.github/workflows/migracao-supabase.yml` **na raiz do repositório** e não dentro de uma pasta extra.
3. Substitua o workflow por este arquivo e faça **commit na branch padrão**. Não basta atualizar só a branch `migracao-supabase`: o GitHub exige que o workflow de disparo manual exista na branch padrão.
4. Vá a `Actions`: deverá aparecer uma execução de `Supabase - preparar e importar` com job `Verificar ativacao do workflow (sem banco)` referente ao commit (se Actions estiver habilitado).
5. Entre no workflow e clique em `Run workflow`. Para investigar o Storage, escolha `etapa = validar` e **não** marque `confirmar_gravacao`.

## Se não aparecer nem a execução de teste

- Confira `Settings > Actions > General`: as Actions devem estar habilitadas e `actions/checkout` e `actions/setup-python` precisam ser permitidas.
- Confira o menu de três pontos da página do workflow: se houver `Enable workflow`, habilite-o.
- Confira se o commit realmente chegou à branch em que está o arquivo. Um push restrito apenas a `docs/` não dispara esse teste de propósito.
- Se o workflow ainda não estiver visível, verifique se `.github/workflows/migracao-supabase.yml` foi colocado na **branch padrão**, sem caminhos adicionais.
- Se aparecer uma execução com falha antes dos jobs, abra a entrada `Invalid workflow file` no Actions para conferir a linha indicada pelo GitHub.

## Após a ativação

Não execute `importar` enquanto a etapa `validar` apresentar erro de download/validação. O ZIP deve estar no bucket privado `migracao`, objeto `dados-migracao.zip`, com credencial administrativa mantida em `Actions Secrets`.

## O que esta correção NÃO faz

Ela não resolve automaticamente um erro HTTP no Supabase Storage, não altera chaves, não inicia a importação em produção e não substitui a necessidade de autorização para rodar Actions no repositório. O erro HTTP só pode ser diagnosticado por uma execução real da etapa `validar`.
