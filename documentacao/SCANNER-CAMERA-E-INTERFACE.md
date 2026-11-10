# Scanner por câmera e ajustes de interface

## O que esta entrega acrescenta

- Leitura EAN por câmera em **Novo lançamento** no Painel Conferente e na entrada **Lançamentos** (ambas utilizam o formulário compartilhado).
- Botão **📷 Ler câmera** ao lado do campo EAN; abre uma janela própria com câmera traseira preferencial.
- Leitura automática de códigos numéricos de 8 a 14 dígitos. **Zeros à esquerda são preservados.**
- O EAN é colocado no campo e a consulta de descrição é disparada. **Não grava produto sem o usuário confirmar o formulário**.
- Fechamento da câmera após reconhecer o código, cancelar, fechar a janela, navegar, sair ou colocar o aplicativo em segundo plano.
- Se o navegador disponibilizar `BarcodeDetector` para EAN/UPC/Code 128, utiliza a API nativa. Caso contrário, carrega a versão fixada `html5-qrcode@2.3.8` (CDN jsDelivr com fallback cdnjs) somente quando a câmera é solicitada. No iPhone a primeira abertura pode depender de internet para carregar essa biblioteca.
- Se o acesso à câmera for negado ou a biblioteca não carregar, o campo manual continua funcionando.
- O endereço antigo do GitHub Pages `lancamento.html` redireciona para `#lancamentos`; a aplicação agora abre o formulário ao restaurar a sessão por esse link.
- Menu recolhível com **◈**, botão lateral de Lançamentos, nome **Estoque** sem “(mapa especial)”, compactação da navegação.
- Modal **Ações** nas Pendências: corrigir o dado, conferir os valores originais ou manter pendente. Não marca pendências resolvidas apenas por visualização.
- Paginação 15/25/50 nas tabelas com paginação existente e nas demais tabelas renderizadas na interface. A busca de Produtos EAN continua limitada pela API aos primeiros 50/100 resultados por consulta; a paginação visual não substitui uma busca paginada no servidor.

## Como publicar

1. No **mesmo repositório**, substitua o conteúdo do ZIP de alterações, preservando a estrutura `public/`, `tests/` e `documentacao/`.
2. Aguarde o novo deploy do **Vercel**. Não precisa executar migração SQL ou Action de importação para esta atualização.
3. No celular, feche o app instalado (PWA) e abra novamente para carregar o Service Worker com cache atualizado (`registro-validades-v4-scanner-camera`). Se a tela antiga persistir, recarregue uma vez com acesso à internet.
4. Entre na loja, vá em **Mapa de Validade → Novo lançamento → Ler câmera**.
5. Autorize a câmera. Posicione o EAN dentro do enquadramento, verifique o código e preencha lote, validade e quantidade antes de **Registrar produto**.
6. Teste também o link antigo `lancamento.html` do GitHub Pages e o botão lateral **Ir para lançamentos** no Painel Conferente.

## Condições técnicas

- HTTPS é necessário para `getUserMedia` (Vercel oferece HTTPS; o endereço GitHub Pages redireciona ao Vercel).
- A permissão de câmera precisa ser dada pelo funcionário no navegador.
- Safari/iOS geralmente não habilita `BarcodeDetector` nativamente, então requer a biblioteca alternativa disponível pela rede ao abrir o scanner pela primeira vez.
- O scanner não faz upload de vídeo nem imagem; somente o EAN é usado na consulta ao catálogo depois da leitura.
- A tentativa de lançamento continua protegida pelo identificador `requestId` existente no backend.

## Verificação local

Execute `npm run check`. O projeto possui testes de validação de EAN, proteção de zeros à esquerda, liberação dos recursos da câmera após leitura/cancelamento e caminho alternativo para Safari. Os testes usam simulação de câmera; é necessário homologar com aparelhos Android e iPhone reais.

## Funcionalidades ainda pendentes de implementação/homologação

Esta entrega **não** implanta o envio OneSignal, a autorização individual de dispositivos ou uma fila IndexedDB offline para os lançamentos. A opção de “celular próprio” do cadastro não equivale à autorização individual segura de cada aparelho. Os indicadores e relatórios continuam exigindo comparação com dados reais do Supabase antes da entrada em produção. Consulte `documentacao/PLANO-OFFLINE-DISPOSITIVOS-ONESIGNAL.md`.
