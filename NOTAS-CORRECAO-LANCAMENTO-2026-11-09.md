# Correção — lançamento sem bloqueio por consulta de mapa (09/11/2026)

## Sintoma

Ao salvar um produto ainda não registrado no mapa, a página `lancamento.html` podia apresentar:

> Não foi possível verificar o mapa antes de salvar: Tempo esgotado ao consultar o mapa do funcionário.

A etapa que fazia a conferência chamava uma ação JSONP separada (`verificarItemMapa`) e aguardava apenas **20 segundos**. Se o Apps Script demorasse, o navegador **não enviava o lançamento**. Esse timeout não demonstrava que havia um item duplicado.

## Alterações

- Retirada do bloqueio por consulta JSONP prévia no `lancamento.html`.
- `code.gs`: agora a verificação de EAN, lote e validade é realizada **no mesmo POST e sob o mesmo lock** usado para gravar os dados.
- Produto inexistente no mapa: é salvo diretamente após as validações usuais de formulário e catálogo.
- Produto existente: o servidor retorna `duplicate` com quantidade/ocorrências, **sem escrever na planilha**. O formulário mostra o aviso de confirmação. Apenas depois de **Adicionar mesmo assim** é encaminhado um novo POST com autorização explícita para acumular ou acrescentar o produto.
- Mantidos os IDs de requisição para impedir gravações duplas do mesmo envio.
- A resposta do polling inclui quantidade/ocorrências. A verificação sem gravação não invalida os painéis nem registra lançamento administrativo fictício.
- Proteção adicional contra dois cliques durante a consulta do catálogo.
- Para `Estoque`, a consulta respeita o layout dessa aba e a loja; para `Transferencias`, separa a loja de origem.

## Atualização obrigatória (dois arquivos)

1. Substitua **`lancamento.html`** na raiz do GitHub Pages.
2. Substitua o conteúdo de **`code.gs`** no mesmo projeto Apps Script utilizado pelo site. Não remova o `login.gs`.
3. No Apps Script, crie uma **nova implantação/versão** do Web App (Gerenciar implantações → Editar → Versão nova → Implantar). Mantenha a URL `/exec` configurada no HTML e as permissões da implantação já existente.
4. Atualize a página no navegador/celular, fechando a versão antiga instalada em PWA, se necessário. Garanta que o aparelho esteja usando a página publicada mais recente.

**Importante:** publicar só o HTML ou só o Apps Script não é suficiente. Os dois devem ser atualizados juntos, pois utilizam o novo status `duplicate`.

## Testes realizados

- Sintaxe JavaScript do `code.gs` e do script da página verificada via Node.js.
- Teste simulado do fluxo com planilha de teste: item novo, duplicidade não gravada, confirmação, reenvio idempotente, lote diferente, validade diferente, separação por loja no Estoque e por loja de origem em Transferencias.

**Limitação:** os testes foram executados com simulação do ambiente Google Apps Script. Não foi possível testar a implantação de produção, permissões reais, tráfego móvel ou latência do Google Sheets. Uma falha de conexão/servidor durante o POST ou polling ainda poderá impedir confirmação; nesses casos, confira a planilha antes de reenviar.
