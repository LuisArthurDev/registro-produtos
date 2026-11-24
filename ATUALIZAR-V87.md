# V87 — Lançamento contínuo e confirmação identificada

- Consulta automática ao catálogo ao digitar um EAN válido ou Código Interno válido, com atraso curto de 350 ms para evitar requisições a cada tecla; botão Consultar mantido como alternativa.
- Quantidade inicia vazia e volta a ficar vazia após salvar, tanto no modal do Painel Conferente como na página de Lançamentos.
- Enter avança Código → Lote → Validade → Quantidade; não envia o formulário antes do último campo.
- Confirmação mostra o EAN salvo e o Código Interno quando obtido do catálogo (inclusive em transferência).
- Preferência EAN/Código Interno e mapa de destino seguem preservadas.
- Proteção contra respostas atrasadas do catálogo alterarem a identificação de um novo produto.

Publicar substituindo apenas os arquivos deste pacote. Nenhuma alteração SQL.
