# Atualização v37 — Gerar arquivo `.TDB` experimental do Procfit

Base: v36 (conferência, Produtos EAN, Fórmulas Especiais e exportação JSON). A atualização **não cria nem altera solicitações no Procfit**, **não aprova Queima** e **não modifica os lançamentos do Supabase**.

## O que foi implementado

Em **Mapa de Validade → Conferir com estoque**, o botão mudou para **Gerar arquivo .TDB (teste)**. Ele trabalha sobre **todos os registros elegíveis da conferência**, não sobre uma única página. Faz uma reconsulta das Fórmulas Especiais antes de exportar e respeita os bloqueios existentes: mapas de funcionários e aba especial Estoque, quantidade corrigida positiva, produtos localizados, sem Fórmulas Especiais.

Ao clicar, o usuário vê uma prévia dos produtos, informa o **ID do usuário Procfit** (valor padrão `5584`, observado somente no TDB de exemplo) e clica **Gerar e baixar .TDB de teste**. Também pode baixar um JSON auxiliar se quiser conferir os valores.

O arquivo produzido é **BINÁRIO `.TDB`**, derivado de modelo sanitizado de `Teste2(1).TDB`; não é um `.JSON` renomeado. O modelo não contém o registro original e não é modificado no processo. Antes de gerar, sua assinatura SHA-256 é verificada.

### Campos que o painel preenche por produto

1. `QUEIMA_ESTOQUE_MOTIVO = 4`
2. `PRODUTO` = Código Interno (ou NULL quando ausente)
3. `EAN` = texto com zeros preservados, quando presente
4. `LOTE` = texto alfanumérico
5. `VALIDADE` = DateTime nativo
6. `QUANTIDADE` = quantidade corrigida positiva

A estrutura também **precisa** de identificadores internos novos para a solicitação e cada item, `QUEIMA_ESTOQUE_ITEM.QUEIMA_ESTOQUE` e `REG_MASTER_ORIGEM` para o vínculo com a solicitação, `FORMULARIO_ORIGEM`, `TAB_MASTER_ORIGEM`, `USUARIO_LOGADO`, `DATA_HORA` e `EMPRESA`. Esses campos de sistema são produzidos a partir do modelo/parametrização; não são campos adicionais do cadastro do produto.

**Não preenche** `APROVADO`, `USUARIO_APROVACAO`, `DATA_HORA_APROVACAO`, preço, curva, estoque ou os demais campos comerciais: ficam NULL no arquivo de teste.

O gerador modifica páginas de dados, bitmaps de ocupação, contadores das tabelas, índices de páginas e mapa de alocação (PFS/EAM). A amostra era um banco de duas tabelas, sem índices de usuário, com páginas de 4.096 bytes. A geração suporta até **10.000 itens em um único arquivo experimental** nesse modelo, antes que o índice interno tenha de ser dividido.

### Limitações técnicas importantes

- **Ainda não há homologação de importação por Ctrl+Alt+I.** A estrutura foi lida de volta por um parser independente, mas somente o Procfit poderá confirmar a aceitação, validações específicas e alocação de IDs na aplicação.
- O TDB original reserva **13 bytes de texto para EAN**, e **15 para Lote**. Se algum item elegível exceder esses limites, a operação inteira será recusada com uma mensagem explícita. O gerador **não trunca** EAN-14, lotes ou zeros iniciais.
- Os metadados `FORMULARIO_ORIGEM = 568094` e `TAB_MASTER_ORIGEM = 565206` vêm da amostra. `USUARIO_LOGADO` pode ser alterado no modal e deve corresponder ao seu usuário Procfit. O campo de origem do cabeçalho `REG_MASTER_ORIGEM` ficou NULL porque não é possível assegurar o vínculo de uma nova solicitação a partir de uma só amostra. Esses pontos são potenciais razões de rejeição no Procfit.
- O método de geração dos novos IDs é **experimental**, sem acesso ao sequenciador interno do ERP. Ele pode ser rejeitado pelo importador mesmo que o arquivo seja fisicamente legível.
- **Não use em produção sem homologação**, não confirme nem aprove Queima durante o teste. Faça cópia de segurança, use uma solicitação de teste e comece com **um único produto** selecionado no filtro.

## Instalação

1. Atualize o projeto publicado no GitHub/Vercel com os arquivos da v37. Não exige migração SQL nova (as migrações já usadas nas versões anteriores devem estar aplicadas).
2. Recarregue a PWA para atualizar o cache `registro-validades-v37-tdb-binario-experimental` (inclui o modelo TDB sanitizado e o gerador).
3. Abra **Mapa de Validade → Conferir com estoque**, escolha um mês com estoque importado e filtre **um** produto elegível para o primeiro teste.
4. Clique **Gerar arquivo .TDB (teste)**, verifique os dados na prévia e o ID do usuário Procfit. Clique **Gerar e baixar .TDB de teste**.
5. Faça o teste de importação em sessão controlada, sem salvar, aprovar ou confirmar nenhuma solicitação real. Se o Procfit recusar, capture a mensagem de erro e um novo `.TDB` de exportação que represente o cenário esperado (sem dados pessoais desnecessários). Isso ajudará a ajustar os metadados e IDs internos.

### Alternativa local, caso o navegador bloqueie o download

O arquivo `scripts/gerar-tdb-teste.mjs` gera um TDB a partir do JSON auxiliar preparado pelo próprio botão. Em um Windows com Node.js 20 ou superior, dentro da pasta do projeto:

```powershell
node scripts/gerar-tdb-teste.mjs "procfit-preparacao.json" "QUEIMA_TESTE.TDB" 5584
```

O script **não sobrescreve** arquivos preexistentes, não abre o Procfit e não aprova Queimas. O nome do JSON real depende do mês e da loja e pode ser selecionado manualmente.

## Testes locais

- Verificação estrutural em Node.js para 1, 17 e 10.000 itens; preservação do EAN, cálculo de quantidade, exclusões, relacionamento cabeçalho/itens, datas, páginas e índices.
- Leitura independente em Python de um TDB sintético com 31 itens: 2 páginas de dados, EAN inicial zero preservado, lote, validade, motivo 4, aprovação NULL, vínculos e índices válidos estruturalmente.
- **Esses testes não substituem uma importação real feita pelo Procfit.**
