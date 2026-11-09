# Atualização: loja salva, correção de mapas e Pendências

Pacote para o **mesmo repositório** GitHub Pages + Vercel + Supabase. Não contém as planilhas nem dados privados.

## Mudanças

- **Login:** ao digitar o número da loja, ele é salvo automaticamente **no dispositivo** via `localStorage` (não no servidor). Nas próximas visitas, o campo aparece preenchido. O botão × remove o valor salvo e permite trocar a loja. PIN e nome não são gravados por esse mecanismo.
- **Login / API:** mensagens de falha interna agora apresentam uma referência curta; detalhes técnicos ficam somente nos Runtime Logs do Vercel. O endpoint `GET /api/health?check=1` confirma se o backend pode consultar o Supabase, sem devolver segredos.
- **Mapas:** o botão **Editar** abre modal para EAN, lote, validade e quantidade. O servidor valida os dados, atualiza o vínculo com Produtos EAN quando o código muda, mantém mês de lançamento e registra a alteração na auditoria. Apenas administradores podem editar registros.
- **Pendências:** nova opção de menu para administradores. Mostra registros de `catalogo_pendencias` e `migracao_pendencias`, com busca e modal de correção. O original permanece preservado; registros resolvidos ficam marcados. As pendências operacionais ficam limitadas à loja do administrador (ou todas as lojas para administrador geral).

## Instalação pelo GitHub Actions e Vercel

1. Faça backup da branch atual e **atualize os arquivos do repositório**, preservando as pastas (`public/`, `api/`, `.github/workflows/`, `supabase/`). O pacote completo contém esses arquivos na estrutura correta.
2. Confirme as variáveis do workflow `SUPABASE_DB_URL` (Session Pooler IPv4 porta 5432) e execute no GitHub **Actions → Supabase - preparar e importar → Run workflow → etapa: `ajustar_pendencias`**. Esta etapa executa somente `supabase/003_pendencias.sql`, sem importar ou apagar dados.
3. Aguarde o deploy da branch configurada no Vercel. Confirme que `SUPABASE_URL` e `SUPABASE_SECRET_KEY` estão configuradas **no Vercel**, em *Project → Settings → Environment Variables*, além dos Secrets do GitHub. Não coloque essas chaves em `public` nem em `docs`.
4. Acesse `https://SEU-SITE.vercel.app/api/health?check=1`. Uma conexão funcional deve retornar `"sucesso":true` e `"banco":"acessivel"`. Se retornar erro, consulte **Vercel → Project → Logs**. Não compartilhe segredos; apenas o código HTTP, a mensagem e a referência de diagnóstico.
5. No site, teste login (loja salva e botão ×), edição dos mapas e a aba **Pendências**, primeiro em um ambiente de homologação. No celular, feche e reabra a PWA caso esteja usando uma versão anterior em cache.

## Observações

- Não execute `importar` só para ativar Pendências. Use `ajustar_pendencias`.
- `supabase/003_pendencias.sql` pode ser repetido com segurança. Ele adiciona colunas sem excluir dados.
- A importação histórica de **21 transferências para revisão** ainda não é inserida automaticamente na tabela de pendências por este pacote: estes registros estão no arquivo privado de migração e demandam um importador específico.
- O mecanismo de login foi melhorado para diagnóstico, mas a causa concreta da falha reportada anteriormente **não pode ser confirmada sem os Runtime Logs do Vercel**.
- As novas rotas foram verificadas com testes simulados; use uma base de teste antes de corrigir registros reais.
