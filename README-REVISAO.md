# Registro de Mapa de Validade — Interface revisada

Este pacote é a versão revisada **09/11/2026**. Os arquivos da raiz do repositório original foram usados como base, conservando os fluxos de login, sessões, lançamentos, controle de validades, estoque, funcionários, administração e notificações.

Para consultar o que mudou, os testes executados, as limitações conhecidas e o procedimento de validação em celular, leia [RELATORIO-REVISAO.md](RELATORIO-REVISAO.md).

## Publicação

- Publique os arquivos HTML, CSS, JS, catálogo, PWA e ícones no GitHub Pages, mantendo o caminho do projeto `/registro-produtos/`.
- Se for atualizar o backend, mantenha no projeto do Google Apps Script os conteúdos de `code.gs` e `login.gs` e **publique uma nova versão** do Web App; confira a URL no frontend (não troque a URL sem atualizar todas as referências).
- O Worker D1 só precisa ser republicado quando `worker/src/index.js`, suas migrações ou a configuração de origem/segredos forem alterados. Este pacote não altera o Worker implantado.
- Verifique os workflows em `.github/workflows/` e as instruções de [README-IMPLANTACAO.md](README-IMPLANTACAO.md).
- Faça testes com credenciais e dados de **homologação** antes de escrever lançamentos, atualizar estoque ou enviar notificações reais.

`produtos_ean.db` continua necessário: ele agora é a contingência de leitura quando o catálogo Cloudflare D1 está indisponível. Não remova `libs/sql.js/`.
