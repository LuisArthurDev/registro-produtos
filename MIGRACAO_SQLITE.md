# Catálogo de produtos em SQLite

O catálogo de consulta do site passa a utilizar `produtos_ean.db`. O arquivo `produtos_ean.json` permanece como fonte de atualização e compatibilidade com a rotina atual de cadastro pelo Apps Script/GitHub.

## Arquivos novos

- `catalogo-sqlite.js`: camada de consulta SQL.js compartilhada pelas páginas.
- `produtos_ean.db`: banco SQLite com os 82.972 registros existentes.
- `catalogo_versao.json`: identificador SHA-256 para invalidar cache quando o banco mudar.
- `scripts/gerar_banco_sqlite.py`: gera e valida o banco a partir do JSON.

## Publicação inicial

1. Envie todos os arquivos do projeto para a raiz do repositório GitHub, preservando as pastas.
2. Confirme que `produtos_ean.db`, `catalogo_versao.json` e `catalogo-sqlite.js` estão na raiz.
3. Em GitHub → Actions, execute `Atualizar produtos EAN` (ou aguarde o acionamento automático pelo push).
4. O workflow instala e versiona `libs/sql.js/sql-wasm.js` e `libs/sql.js/sql-wasm.wasm`, gera novamente o SQLite e publica os artefatos no repositório.
5. Aguarde a publicação do GitHub Pages e faça uma atualização forçada no navegador (`Ctrl+F5`).

## Atualizações futuras

- Quando `Items.ods`, `produtos_ean.json` ou o gerador mudar, o workflow atualiza a fonte JSON e recria o banco SQLite.
- O cadastro manual continua usando a rota existente do Apps Script para atualizar o JSON. O workflow gera o SQLite em seguida.
- `catalogo_versao.json` muda junto com o banco e força o navegador a baixar a versão nova, em vez de reutilizar um arquivo antigo em cache.

## Estrutura e integridade

Tabela `produtos`:

- `ean TEXT PRIMARY KEY`: identificador original do catálogo, preservado como texto (inclusive zeros à esquerda).
- `codigo_interno TEXT`: código interno do produto.
- `descricao TEXT`: descrição do produto.
- `secao TEXT`: seção do produto.

O banco usa `WITHOUT ROWID`, páginas de 8 KiB e índice para código interno. O gerador executa `PRAGMA integrity_check` antes de substituir o arquivo definitivo. A consulta por EAN e código interno é indexada; a tela de produtos usa paginação SQL de 100 registros.

## Dependência do navegador

O runtime SQL.js é carregado primeiro de `libs/sql.js/`, versionado pelo workflow. Há fallback para jsDelivr caso os arquivos locais ainda não tenham sido publicados. O site não oferece modo offline: é necessário acessar o GitHub Pages para carregar o banco.

## Publicação do GitHub Pages usando Actions

O projeto recebido contém o workflow de atualização do catálogo, mas não contém um workflow de deploy do GitHub Pages. Se o repositório publica o site por `actions/deploy-pages`, o workflow de deploy deve também ser executado após a conclusão bem-sucedida de `Atualizar produtos EAN` (evento `workflow_run`, workflow `Atualizar produtos EAN`). Isso garante que futuras alterações do JSON, convertidas pelo bot em SQLite, cheguem ao site publicado. No workflow de deploy, deve existir somente um `upload-pages-artifact` por execução.
