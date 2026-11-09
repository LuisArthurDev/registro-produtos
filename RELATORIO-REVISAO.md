# Relatório técnico — Registro de Mapa de Validade

**Versão revisada:** 09/11/2026. **Base:** arquivos da raiz do ZIP enviado; o subdiretório `registro-produtos-final/` era uma cópia antiga do mesmo projeto (com diferenças em `painelconferente.html` e `login.gs`).

## Alterações implementadas

1. **Design em todas as páginas HTML.** Adicionados `assets/css/sistema-ui.css` e `assets/js/sistema-ui.js` com identidade visual coerente, cartões e tabelas aprimorados, foco visível para acessibilidade, adaptação de cabeçalhos e filtros para celulares, bordas/contraste no tema escuro e tratamento de movimento reduzido. Os IDs e as funções de cada página foram preservados.
2. **Modo claro/escuro.** Paleta unificada para login, lançamento, conferência, visualização, administração, instalação e erro. Usa a preferência do sistema se o usuário não escolheu um tema; a escolha manual é persistida na chave `tema`. Páginas auxiliares ganharam um seletor de tema.
3. **Menu móvel do conferente.** Adicionado fechamento por fundo semitransparente e tecla Esc, rótulos acessíveis e estado expandido, sem substituir a navegação existente.
4. **Falhas no `fetch` do catálogo.** `catalogo-sqlite.js` faz uma segunda tentativa limitada de consultas D1; se o serviço não responder, carrega `produtos_ean.db` e `sql.js` do próprio site **somente sob demanda**, mantendo a API usada pelos painéis. O `lancamento.html` passou a usar esta camada compartilhada, em vez de uma requisição direta ao D1. A busca/lookup local foi testada sobre o banco real de 82.972 produtos. O modo local é de consulta; o cadastro remoto de novos produtos ainda exige conexão com o Worker.
5. **Performance do estoque.** Substituída uma comparação cruzada entre todos os produtos e todos os mapas por índices de código/EAN e código interno. A correspondência fica próxima de O(N+M) antes da renderização, em vez de O(N×M). Mantém múltiplos mapas por produto e a menor data de validade.
6. **Importação ODS em celular.** O armazenamento local é agora *opcional*. Estouro de quota do `localStorage` não cancela a leitura e o uso do estoque. Se o catálogo não responder, as descrições da planilha continuam disponíveis. Mensagens deixam claro quando o envio remoto não pôde ser confirmado.
7. **Login no celular.** Se a sessão não puder ser gravada por excesso de armazenamento, tenta remover apenas o cache local de estoque, que pode ser recuperado, e salva a sessão novamente.
8. **Segurança.** `code.gs` valida o nome de função dos callbacks JSONP antes de gerar JavaScript executável. Botões da tabela de estoque usam atributos `data-*`/delegação de eventos no lugar de dados interpolados em código JavaScript inline.
9. **Organização.** Eliminadas do pacote de entrega a cópia interna `registro-produtos-final/`, a pasta `.git/` e `backup.zip`. Preservada a pasta `.github/workflows/`, ausente na raiz original. Arquivos operacionais, fontes ODS, catálogo JSON/SQLite, Workers, migrações, scripts e Apps Script foram mantidos.

## O que a análise encontrou, mas não deve ser alterado sem testes reais

- **Upload do estoque ao GitHub:** a chamada de `fetch` para Apps Script usa `mode: 'no-cors'`. Um navegador **não pode ler a resposta** para confirmar o sucesso, e falhas de conectividade, limitação de upload ou bloqueio do navegador continuam possíveis. O arquivo ODS pode ser grande (vários MB). O envio e as credenciais devem ser testados no celular com o Apps Script publicado. A correção completa exige um endpoint autenticado que permita confirmação da resposta, ou um fluxo de upload/retorno assíncrono com acompanhamento no servidor; a alteração não foi forçada para evitar quebrar o upload que hoje funciona em alguns dispositivos.
- **Cloudflare Worker D1:** a lista `ALLOWED_ORIGINS` em `worker/src/index.js` permite `https://luisarthurdev.github.io`, `localhost:5500` e `127.0.0.1:5500`. Hospedagem por **outro domínio ou porta** causará erro de CORS até configurar explicitamente a nova origem e republicar o Worker.
- **Apps Script:** a arquitetura JSONP expõe tokens de sessão em parâmetros URL e usa GET para algumas alterações de dados. Recomenda-se migrar gradualmente essas rotas para endpoints autenticados via POST, com controles de autorização do servidor. Fazer isso sem migração coordenada quebraria login, sessão e lançamentos.
- **Notificações push:** dependem de chaves/propriedades do Apps Script, domínios e assinatura OneSignal. Sem essas credenciais, dispositivo inscrito e acesso aos serviços, não é possível confirmar a entrega real.
- **Renderização de tabelas grandes:** há paginação genérica que oculta linhas no DOM, mas parte das tabelas ainda constrói todas as linhas antes de paginar. Uma evolução futura é paginação no backend/virtualização, com revisão dos filtros e exportações.
- **Dependências externas:** o painel ainda utiliza `lucide`, `SheetJS` e OneSignal por CDN; bloqueios de rede ou rastreadores podem afetar recursos não essenciais e importação de arquivos, especialmente no celular.

## Validações realizadas

- Análise de sintaxe de todos os scripts inline das 7 páginas HTML, arquivos `.js`, `code.gs` e `login.gs` via Node.js: **sem erros de sintaxe**.
- Análise de links/referências locais (`src`/`href`) das páginas: **sem arquivos locais faltando**.
- CSS externo validado com parser CSS: **sem erros de parsing**.
- Banco `produtos_ean.db` consultado com SQL; teste de caminho de falha `fetch` → contingência SQLite, com lookup e busca reais: **aprovado**.
- Verificação estática de IDs do painel: alguns elementos referenciados, como `btnExportarProcfit`, são criados dinamicamente; outros são opcionais e protegidos com `?.` ou teste de existência.
- **Não foi realizado teste integrado** com contas reais, Apps Script, Google Sheets, celulares, OneSignal, Cloudflare em produção ou importação/publicação no GitHub; essas operações dependem das credenciais/ambiente de implantação. A tentativa de renderização por Chromium headless neste ambiente não produziu captura utilizável, portanto não é possível declarar que cada breakpoint foi visualmente verificado em aparelho real.

## Teste de aceite recomendado antes de produção

1. Fazer backup do repositório e do Apps Script publicado. Substituir os arquivos do site e publicar a nova versão de `code.gs` quando necessário. Confirmar que `login.gs` da raiz permanece a versão mais recente.
2. Android e iPhone: abrir login com 360 px e 390 px; alternar claro/escuro e recarregar; usar login por PIN e, se habilitado, celular próprio.
3. Abrir `lancamento.html`, buscar EAN conhecido, validar descrição e código interno, lançar um item de teste e verificar na planilha. Conferir câmera e permissões.
4. Abrir o Painel Conferente no celular, usar o menu, os filtros, a Queima, o Mapa de Validades, Controle de Validade, Estoque, Funcionários e Notificações. Verificar fundos, contraste, scroll horizontal apenas dentro das tabelas.
5. Desligar temporariamente a API D1 (em ambiente de teste) ou bloquear o domínio do Worker; confirmar que a consulta encontra o mesmo produto via banco SQLite. Restaurar a API.
6. Importar uma planilha ODS grande em um celular; confirmar que a tela apresenta produtos mesmo quando o armazenamento do navegador está cheio. Verificar no GitHub se `estoque/estoque_<loja>.ods` foi realmente atualizado — a mensagem do `fetch no-cors` não é comprovação.
7. Testar sessão/inatividade, edição, exclusão, transferência e autorização por loja. Verificar notificações com um telefone inscrito e consentimento concedido.

**Importante:** preservar `GITHUB_TOKEN`, `MV_ONESIGNAL_REST_API_KEY`, `D1_API_SECRET` e demais segredos **somente** nas propriedades/segredos do servidor. Nunca inseri chaves secretas no frontend nem no ZIP.
