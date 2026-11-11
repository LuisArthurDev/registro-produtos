# Atualização v26.1 — Grupo, estoque Procfit, cópia TSV e tabelas sem rolagem horizontal

## O que muda

- **Produtos EAN:** colunas EAN, Código Interno, Descrição, Seção e **Grupo**. Formulários de cadastro/edição com seleção de Seção.
- **Grupo pelo ODS:** workflow `.github/workflows/atualizar-grupos-produtos.yml`, ativado pelo commit do arquivo **`atualizacao-produtos.ods` na raiz do repositório** ou manualmente. Valida linha por linha o par **EAN + Código Interno** e atualiza **apenas** `produtos.grupo` quando ambos identificam a mesma linha no Supabase. Não cadastra novos produtos, não modifica EAN nem código interno e não completa zeros ausentes. Exporta `relatorio-atualizacao-grupos.json` nos artefatos da Action, com divergências.
- **Seções:** o nome do menu continua **Seções**, mas a organização é agora **por Grupo**, com sugestões por frequência de registros, cards por funcionário, distribuição por arrastar ou select, ocultar/excluir da exibição e restaurar. As atribuições antigas por Seção são reiniciadas na migração 017; nenhum lançamento histórico é apagado. A exclusão das seções Brinde, Default e Serviços continua em vigor.
- **Estoque ODS/CSV:** aceita relatório Procfit com colunas `Empresa`, `C.Estoque`, `Produto`, `Descricao`, `EAN`, `Secao`, `Saldo`, etc. A importação separa linhas válidas e inválidas, preserva EAN como texto, aceita saldo com vírgula decimal, usa Código Interno quando o EAN estiver inválido/ausente e exibe relatório de recuperação/ignorados. Não usa identificação por adivinhação.
- **Mapa de Validade:** botão **Copiar para Conector Procfit — v1.0**. Copia todos os resultados dos filtros ativos (não só a página visível) como texto TSV, com cabeçalho e cinco colunas: `Código Interno`, `EAN`, `Lote`, `Validade`, `Quantidade`.
- **Conferência com Estoque:** botão **Copiar corrigidos para Conector Procfit — v1.0**, que usa a quantidade corrigida pelo último saldo ODS importado e ignora saldos não localizados/zerados. A conferência é apenas leitura.
- **Tabelas responsivas no sistema inteiro:** removidas larguras mínimas que causavam barras horizontais. Em telas menores que 1500 px, tabelas viram cards com rótulos de cada campo e ações acessíveis. Em telas largas, permanecem tabelas com quebras de linha. O quadro de Grupos mantém rolagem **vertical interna** em cada funcionário. O Service Worker foi atualizado para disponibilizar o novo módulo em PWA.
- **Pendências:** a migração SQL 016 garante a tabela `public.lancamento_pendencias` para EANs desconhecidos e a operação Ignorar, preservando o lançamento.

## Ordem de instalação (importante)

1. Faça **backup do Supabase**. Publique primeiro os novos arquivos em uma branch de testes.
2. Confirme que as migrações anteriores **001 a 015** foram aplicadas ao banco correto. Essas migrações não devem ser ignoradas.
3. No GitHub Actions abra **Supabase - preparar e importar** e execute a etapa `grupos_produtos`. O workflow executa **SQL 016 e SQL 017**, nessa ordem. Confirme sucesso e verifique os logs; se houver erro, não publique o frontend ainda.
4. Confirme no Supabase que `public.lancamento_pendencias`, a coluna `public.produtos.grupo` e a tabela `public.organizacao_grupos` existem. Se necessário, no SQL Editor execute `NOTIFY pgrst, 'reload schema';`.
5. Atualize o código do Vercel e verifique que ele aponta para o **mesmo projeto Supabase** usado na migração. Recarregue a PWA após o deploy para atualizar o cache.
6. Coloque o relatório **`atualizacao-produtos.ods`** na **raiz** do repositório. Um commit nesse arquivo inicia a Action, **depois da migração**. Alternativamente execute a Action manualmente com `aplicar=true`. A opção `aplicar=false` gera somente o relatório de pré-validação e não atualiza o banco.
7. Confira o artefato `relatorio-atualizacao-grupos.json`. Linhas com EAN/código divergente ficam no relatório, não alteram dados. A organização por Grupo começa sem responsáveis e deve ser atribuída na aba Seções.
8. Reimporte seu `Estoque.ods` ou CSV pelo menu de estoque e confira o relatório de importados, recuperados e ignorados.
9. Teste **Mapa de Validade → Copiar para Conector Procfit — v1.0** e, em `Conferir com estoque`, a opção **Copiar corrigidos**.
10. Teste em um celular e um computador: mapa, filtros, ações, Queima, Perdas, Transferências, Produtos EAN, Visualização e Painel Geral. Nenhuma tabela deve exigir arrastar para os lados.

## Formato TSV esperado pelo Conector Procfit

```text
Código Interno\tEAN\tLote\tValidade\tQuantidade
97362\t07898962711477\tABC123\t30/11/2026\t2
\t07891234567890\tLOTE02\t15/12/2026\t1
```

Na cópia real, `\t` representa um caractere TAB; cada lançamento ocupa uma linha. Registros incompletos ou com quantidade menor ou igual a zero são ignorados e informados no aviso.

## Validação realizada

- 223 testes automatizados JavaScript aprovados.
- 24 testes automatizados Python aprovados.
- Teste visual local no Chromium, com tabelas de Mapa de Validade e Conferência em **320, 375, 390, 600, 768, 900, 1024, 1199, 1200, 1280 e 1600 px**: nenhum overflow horizontal nos cenários de teste.
- **Não foi testado** contra seu banco de produção, nem foi executada uma atualização real do ODS na sua Action. Valide primeiro em ambiente de homologação.

## Segurança dos dados

A atualização por ODS só muda `grupo` do produto depois de comparar os dois identificadores. A migração 017 reinicia a organização **antiga por Seção**: não exclui mapas, usuários, EANs, saldos ou histórico de auditoria. Se você precisar restaurar a antiga atribuição por Seção, mantenha o backup realizado antes da migração. Excluir ou ocultar um Grupo retira-o da visualização operacional, sem excluir produtos do catálogo.
