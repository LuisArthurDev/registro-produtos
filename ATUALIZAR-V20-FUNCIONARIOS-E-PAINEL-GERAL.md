# v20 — Painel Geral exclusivo de Luis Arthur e gestão de lançamentos por funcionário

## Alterações

- **Painel Geral exclusivo de Luis Arthur**: a autorização passa a exigir um marcador único no banco, ligado ao **UUID da conta Luis Arthur da Loja 151**. A validação é feita em todas as requisições da API, não apenas na interface. A origem na Loja 151 **não limita** o acesso global quando o modo Geral é ativado com o PIN existente.
- **Editar nome do funcionário**: no menu **Funcionários**, o administrador de loja pode renomear. Todos os lançamentos ativos vinculados à conta e os lançamentos antigos reconhecidos pelo mapa anterior mudam para o nome novo, em uma transação. O PIN não é alterado. O funcionário precisa entrar novamente **com o nome novo** porque suas sessões anteriores são encerradas.
- **Excluir funcionário**: é uma **exclusão lógica** da conta. Antes de confirmar, o administrador escolhe transferir **todos os lançamentos ativos** a outro funcionário ativo da **mesma loja** ou deixá-los com dono **Sem responsável**. Os registros e IDs de lançamento não são excluídos. A identidade anterior é guardada e as sessões do funcionário são encerradas.
- **Transferir lançamentos**: botão na aba Funcionários, disponível no topo e na linha de cada funcionário. Escolha origem (inclusive **Sem responsável**), destino, **mês do lançamento** e, opcionalmente, seção. Selecione itens individuais ou marque explicitamente **todos os itens filtrados** antes de confirmar. A operação é atômica no Supabase; não envolve mapas especiais nem outras lojas.
- **Auditoria**: renomear, excluir e transferir registram quem realizou a ação, origem, destino, quantidade e os IDs dos lançamentos movimentados.

## ATENÇÃO: ordem de instalação

1. Faça um backup do Supabase. Confirme que a conta ativa **Luis Arthur**, `perfil=admin`, `loja_id=151`, está cadastrada **uma única vez**. A migração interrompe a execução se houver zero ou múltiplas contas correspondentes.
2. As migrações anteriores **008, 010 e 011** precisam ter sido aplicadas. Em especial, a 011 configura o acesso duplo de Luis Arthur e o campo `acesso_geral`.
3. Envie esta versão para o mesmo repositório GitHub, de preferência primeiro para uma branch de homologação.
4. Execute **GitHub → Actions → Supabase - preparar e importar → Run workflow**, escolhendo a nova etapa **`proteger_geral_e_funcionarios`**. Ela executa somente `supabase/012_exclusividade_geral_funcionarios.sql`, sem reimportar o catálogo ou os mapas.
5. Verifique que o Actions terminou com sucesso. Em seguida, confirme o deploy dos novos arquivos no Vercel.
6. Entre com Luis Arthur no modo Administrador de Loja. O botão do Painel Geral solicitará o **PIN habitual** para a elevação temporária. Outras contas — inclusive o antigo login separado de Admin Geral, se existir — não poderão acessar o painel global.
7. Faça um teste com dois funcionários fictícios: renomeie um, transfira apenas um item do mês, depois escolha uma seção e faça uma transferência em lote. Teste excluir deixando **Sem responsável** e, por fim, atribuir novamente a outro funcionário.
8. Atualize a PWA ou feche e abra para retirar o cache antigo (Service Worker v20).

## Regras operacionais e limites

- O mês escolhido é `mes_lancamento` (quando o produto entrou no mapa), **não o mês do vencimento**.
- O filtro por seção usa o catálogo de Produtos EAN. Para registros antigos sem vínculo por `produto_id`, o servidor tenta descobrir a seção pelo EAN. Itens sem seção catalogada podem ser transferidos escolhendo **Todas as seções**.
- A lista é limitada a 5000 registros por mês/origem; para conjuntos grandes, trabalhe em partes por mês. A prévia mostra os primeiros 150 registros filtrados, com opção específica para movimentar **todos os filtrados**.
- Se um usuário com PIN válido estiver conectado quando seu cadastro for excluído ou renomeado, a sessão é encerrada. Depois da renomeação, o login será feito pelo nome novo, com o mesmo PIN.
- O modo **Sem responsável** não atribui automaticamente itens ao próximo funcionário cadastrado. O administrador deve usar **Transferir lançamentos** quando houver um novo dono da seção. Isso evita associar produtos à pessoa errada.
- Registros já excluídos dos mapas (exclusão lógica) não são transferidos; os dados históricos e os registros de auditoria permanecem preservados.
- Não compartilhe chaves do Supabase ou os PINs. A migração não altera senhas.

## Homologação

Os testes automatizados validam rotas, filtros, validações e chamadas de funções SQL. **Não foram executadas gravações no Supabase de produção**. A migração SQL ainda precisa ser aplicada e testada no seu banco. A conferência visual automatizada de navegador neste ambiente foi bloqueada por política local; teste o formulário no desktop e no celular antes de liberar para a equipe.
