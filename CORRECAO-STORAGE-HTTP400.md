# Correção do HTTP 400 no download privado do Supabase Storage

## Diagnóstico

O erro HTTP 400 **não confirma** que o bucket ou o arquivo estão ausentes. O Supabase envia um código de erro estruturado no JSON de resposta (por exemplo `InvalidRequest`, `InvalidJWT`, `InvalidKey`, `AccessDenied`). A versão anterior do script descartava esse detalhe.

## Alterações

- `scripts/baixar_dados_privados.py` agora identifica **apenas os códigos de erro permitidos**, sem imprimir URL, token ou mensagem livre enviada pelo servidor.
- Com a chave moderna **`sb_secret_`**, tenta primeiro pedir ao Storage uma **URL temporária de 5 minutos**, no mesmo projeto e para o objeto solicitado. O link **não é mostrado no log**. Se a assinatura falhar, tenta o acesso autenticado anterior e relata os dois códigos de erro para diagnóstico.
- Com a chave JWT legada `service_role`, mantém o procedimento anterior.
- Preserva validação de tamanho, caminhos e conteúdo do ZIP.
- Adiciona quatro testes específicos e executa os testes Python nos workflows.

## Aplicação

1. Substitua os arquivos correspondentes no repositório GitHub (script, testes e workflows).
2. Verifique no Supabase que **Storage → migracao** é um bucket **privado** contendo `dados-migracao.zip` na raiz.
3. Em `Settings → Secrets and variables → Actions`, confira se `SUPABASE_URL` é a URL **HTTPS do projeto**, no formato `https://<project-ref>.supabase.co`, e `SUPABASE_SECRET_KEY` é a **chave secreta do mesmo projeto**, não a publishable.
4. Garanta que o segredo opcional `MIGRATION_BUNDLE_URL` está vazio/removido para usar o bucket. O log atual diz `Origem: bucket privado`, então esta opção já não está prevalecendo.
5. Execute manualmente **Supabase - preparar e importar → etapa: validar**, sem gravação no banco.

## Interpretação do novo resultado

- `InvalidJWT`: há incompatibilidade de credencial com o endpoint autenticado; verifique o tipo de chave e o método com URL temporária.
- `InvalidRequest` ou `MissingParameter`: requisição rejeitada; revise a configuração da URL e a rota.
- `InvalidBucketName` ou `NoSuchBucket`: verifique o bucket `migracao` no projeto correto.
- `InvalidKey` ou `NoSuchKey`: verifique o objeto `dados-migracao.zip`, na raiz, sem pastas intermediárias.
- `AccessDenied` ou `401/403`: verifique se a chave é administrativa e pertence ao mesmo projeto.
- Se a URL temporária funcionar, o ZIP será extraído no runner, sem publicação no repositório.

**Não envie os valores dos secrets nem URLs assinadas.** Envie somente a mensagem de erro nova. Não abra o bucket ao público, não publique a planilha ou ZIP e não ative a importação antes de validar.

> Os testes foram feitos offline, com respostas simuladas. A conectividade real e a permissão do Storage só podem ser validadas no GitHub Actions do seu projeto.
