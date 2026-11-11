# Atualização v32 — Mapa de Destino fixo e descida múltipla do Estoque

Esta atualização parte da **v31** e mantém as regras anteriores de conferência, Procfit, Grupos, validade, notificações e mapas. Ela não apaga registros históricos.

## 1. Mapa de Destino não volta a Estoque

- Para o administrador de loja, o formulário **Novo lançamento** preserva o Mapa de Destino escolhido mesmo depois de uma gravação bem-sucedida.
- Campos do produto (EAN, lote, validade) são limpos para o próximo lançamento; quantidade volta a 1.
- O Mapa de Destino é lembrado no navegador **por usuário e loja**, inclusive ao fechar e reabrir o formulário.
- Ao mudar manualmente o destino, o novo valor passa a ser usado nos próximos lançamentos.
- Funcionários continuam com o próprio mapa fixo, definido pela sessão. Não altera direitos de lançamento nem permite ao administrador registrar diretamente no mapa de um funcionário.
- O formulário mantém também o tipo de lançamento ao reinicializar.

## 2. Botão Descer selecionados para o mapa

**Local:** Painel Conferente → **Estoque** (mapa especial; não é o Saldo Procfit importado).

1. Marque um ou mais registros da tabela. A seleção é preservada ao navegar pelas páginas.
2. **Selecionar todos filtrados** seleciona os registros com quantidade positiva em todas as páginas do filtro ativo, não apenas os 15/25/50 visíveis.
3. Clique em **Descer selecionados para o mapa**.
4. Na janela, escolha **um Mapa de Destino** para todos os itens. O sistema mostra total de registros e unidades.
5. Clique **Confirmar descida dos selecionados** e confirme a movimentação.
6. O lote move **todas as unidades disponíveis** dos registros selecionados, atualiza o Estoque e grava os novos lançamentos com EAN, lote e validade originais.

### Segurança e limitações

- Um lote possui de **1 a 500 registros**, por segurança. Para volumes maiores, movimente em lotes sucessivos.
- Operação disponível apenas ao **Administrador de Loja**.
- A validação de loja, origem Estoque, funcionário de destino ativo, IDs duplicados e quantidades é executada no servidor e no banco.
- A SQL 019 usa transação PostgreSQL única: se qualquer item falhar, **todos os itens desse lote são revertidos**.
- A requisição usa identificador idempotente, permitindo repetir a mesma tentativa após erro de conexão sem duplicar movimentações já confirmadas.
- O vínculo `funcionario_id` do lançamento descendido passa a ser o **funcionário destinatário**, não o administrador que executou a movimentação. A auditoria mantém o administrador responsável.
- A descida **não** remove o produto do catálogo nem exclui o lançamento original; reduz sua quantidade e cria o lançamento de destino.

## 3. Como publicar (ordem obrigatória)

1. Faça um **backup do Supabase** e publique os arquivos em uma branch de homologação.
2. Confirme as migrações anteriores até a **SQL 018** aplicadas no projeto Supabase correto.
3. Atualize o repositório GitHub com a v32.
4. Abra **GitHub → Actions → Supabase - preparar e importar → Run workflow** e selecione **`descer_estoque_lote`**.
5. Aguarde a conclusão da execução de `supabase/019_descer_estoque_em_lote.sql`. A migração cria a função transacional de lote e corrige a atribuição ao funcionário na função individual.
6. Confirme o deploy Vercel e recarregue a PWA; o cache foi atualizado para `registro-validades-v32-destino-fixo-descida-lote`.
7. Em homologação, registre um lançamento com destino `Psicotropicos` e confira que após salvar o destino permanece selecionado. Feche e reabra para verificar novamente.
8. Na aba Estoque, selecione dois registros de teste, escolha um funcionário e execute a descida. Confira no mapa do funcionário, no Estoque e na auditoria.

**Importante:** publique o código de movimentação em lote **somente depois** de a migração 019 ter sido aplicada. Caso contrário, o Supabase responderá que não encontrou a função `public.descer_estoque_lote`.

## Verificações locais

- Testes JavaScript (incluindo API: permissões, seleção de IDs, preservação do destino e chamada transacional).
- Testes Python do projeto.
- Nenhuma migração foi executada em ambiente de produção.
- A interação gráfica completa foi tentada com Chromium, mas a navegação para o host de teste foi bloqueada pelo ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR`). Portanto é necessário realizar o teste final na homologação do Vercel.
