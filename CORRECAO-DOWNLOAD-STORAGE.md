# Correção: erro no download do pacote privado pelo GitHub Actions

## O que foi corrigido

O script anterior ocultava o código HTTP do Storage com a mensagem genérica `HTTPError`, impossibilitando identificar falta de permissão, segredo incorreto ou arquivo inexistente. Também rejeitava um TXT de aviso que vinha dentro do ZIP privado entregue anteriormente. Ambos os problemas foram corrigidos.

O novo script:
- mostra **HTTP 400/401/403/404/429/5xx** com orientações, sem exibir chave, token nem URL assinada;
- informa se está usando o bucket privado ou `MIGRATION_BUNDLE_URL`;
- autentica chaves modernas `sb_secret_` pelo cabeçalho `apikey`, e chaves legadas JWT com `Authorization: Bearer`;
- aceita o TXT informativo adicional fornecido no ZIP privado, mas não o extrai;
- valida todos os nomes de arquivos antes de extrair, protegendo `private_data`.

## Atualização mínima

1. Substitua no repositório `scripts/baixar_dados_privados.py` pelo arquivo corrigido.
2. Opcionalmente, substitua `.github/workflows/validacao.yml` e adicione `tests/testar_download_storage.py` para o teste automático.
3. Execute `Actions → Supabase - preparar e importar → Run workflow → etapa: validar`.
4. Leia a nova mensagem. Os cenários comuns:

| Erro | O que verificar |
|---|---|
| **HTTP 401** | A Secret Key está correta e é do mesmo projeto que `SUPABASE_URL`? Não é `sb_publishable_`? |
| **HTTP 403** | A chave tem autorização administrativa para o Storage privado? |
| **HTTP 404** | Supabase → Storage → bucket **`migracao`** (Private), arquivo **`dados-migracao.zip`** na raiz, com esses nomes exatos |
| **HTTP 400** | URL do projeto e caminho do objeto; ou URL assinada incorreta |
| **HTTP 5xx / 429** | Problema transitório ou limite do serviço; execute novamente |

Se usar `MIGRATION_BUNDLE_URL` em Actions Secrets, **ela tem prioridade** sobre o bucket e pode ter expirado. Remova esse secret para obrigar uso do Storage autenticado ou gere outra URL assinada. Nunca publique URLs assinadas ou segredos em logs/issues.

### Atenção

O bucket deve continuar **privado**. Não é necessário liberar acesso público, criar políticas que exponham o ZIP ou adicionar o pacote ao repositório GitHub.

O script pode identificar o tipo de falha, mas a causa específica depende do código HTTP retornado pelo seu Supabase. **Não é possível testar o acesso real daqui sem as credenciais, que devem continuar privadas.**
