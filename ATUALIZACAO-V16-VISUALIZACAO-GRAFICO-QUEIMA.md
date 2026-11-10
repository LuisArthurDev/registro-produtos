# Atualização v16 — Visualização do Administrador + gráfico de Queima (3 estados)

## Correção da `visualizacao.html`

- A conta **Administrador de Loja** abre `visualizacao.html` normalmente, sem ir ao Painel Conferente automaticamente.
- Há **seletor de Mapa** com as quatro abas especiais: **Estoque**, **Termolabil**, **Psicotropicos** e **Antibioticos**, incluindo a opção de mostrar todas as abas especiais de uma vez.
- Os mesmos modos de visualização continuam disponíveis para funcionário e administrador: histórico por mês, filtro por validade, Vencidos/Retiradas, Sinalizações, pesquisa, impressão, CSV, paginação e ações de edição, exclusão e sinalização.
- O funcionário continua restrito ao **próprio mapa**, inclusive na API do Vercel.
- A API da Visualização consulta apenas as abas especiais para o administrador, inclusive nos registros de Vencidos, Queima e Sinalizações, sem expor os mapas dos funcionários. O botão **Painel Conferente** aparece na Visualização para administrador, mas a abertura do painel exige clique explícito.

## Novo gráfico circular no **Dashboard do Painel Conferente**

O gráfico não aparece na `visualizacao.html`: está somente no Dashboard do Painel Conferente.

O gráfico tem **três setores**:

1. **Não lançados na Queima** (cinza-azulado): registros ativos do mapa com quantidade positiva e sem lançamento correspondente na Queima.
2. **Lançados, não aprovados** (âmbar): lançamentos atuais na Queima que ainda não receberam aprovação.
3. **Aprovados** (verde): lançamentos atuais na Queima aprovados.

**Cálculo:** a base é o conjunto de registros ativos dos mapas, acrescido de lançamentos na Queima sem mapa ativo correspondente (por exemplo, registros históricos/manuais). A correspondência usa o `lancamento_id` quando disponível; nas entradas legadas sem ID, usa EAN + lote + validade, sem associar uma entrada a mais de um mapa. Relançamentos históricos com `estado = relancado` são excluídos para não duplicar produtos. Uma entrada ativa tem apenas **um** estado, escolhido pela ocorrência atual mais recente do mesmo lançamento.

O gráfico apresenta o total de registros no centro, o total de cada setor e a porcentagem no painel lateral. **Unidade de contagem: registros de produto, não unidades físicas.** Se a consulta da Queima falhar, o indicador mostra **Consulta indisponível** em vez de exibir zeros falsos.

## Instalação

1. Faça backup do repositório e mantenha uma branch de homologação.
2. Substitua os arquivos do ZIP de atualização no **mesmo repositório** e envie para o GitHub.
3. A página Visualização depende da migração **SQL 010** introduzida na versão v14: se ainda não foi aplicada, execute pelo GitHub Actions a etapa `atualizar_visualizacao` (as migrações 008 e 009 devem ter sido executadas anteriormente).
4. **Esta atualização v16 não exige nova migração SQL** se a 010 já tiver sido aplicada.
5. Aguarde o deploy do Vercel. Feche e reabra a PWA ou atualize a página para carregar o novo cache (`registro-validades-v16-visualizacao-grafico3`).
6. Entre como administrador da loja, abra `https://SEU-DOMINIO/visualizacao.html`: a aba não deve redirecionar para o Dashboard. Selecione cada aba especial.
7. No Dashboard do Painel Conferente, confira os três setores contra um conjunto conhecido de registros do Mapa e da Queima.

## Testes e limites

- Testes automatizados JavaScript para os três estados, relançamento histórico, vínculos legados e autorização dos mapas do administrador.
- O acesso ao servidor de navegação local foi bloqueado pelo ambiente do navegador automatizado (`ERR_BLOCKED_BY_ADMINISTRATOR`). Não foi possível concluir um *smoke test* visual no Chromium nesta execução.
- Os cálculos devem ser homologados com registros reais do Supabase antes de tratar os totais como definitivos. Nenhum dado de produção foi modificado por esta entrega.
