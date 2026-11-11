# Versão v28 — Conferência com Estoque / Conector Procfit e tabelas compactas

Base: projeto v27. Esta versão não altera o esquema PostgreSQL nem os lançamentos já existentes.

## O que mudou

### Conferência de Mapa de Validade com Estoque

1. O botão **Copiar para Conector Procfit — v1.0** existe **somente** em **Mapa de Validade → Conferir com estoque**. Foi retirado do Mapa de Validade comum para evitar exportar a quantidade não corrigida.
2. Produtos **não localizados** no último estoque importado aparecem com **Quantidade Estoque = 0** e **Quantidade Corrigida = 0**, além da indicação textual **Não localizado**. Eles não são incluídos na cópia para o Procfit. Os itens não são apagados dos mapas.
3. Itens encontrados com saldo zero ou com quantidade corrigida zero também são ignorados. Se o mesmo EAN estiver em diversos lotes, a quantidade disponível continua a ser distribuída uma única vez, a partir das menores datas de validade.
4. A cópia usa **todos os registros da conferência selecionada**, respeitando o filtro de mês e os demais filtros aplicados ao mapa, e não somente a página visível. A lista copiada possui **exatamente cinco colunas**, separadas por TAB, com CRLF entre registros:

   `Código Interno<TAB>EAN<TAB>Lote<TAB>Validade<TAB>Quantidade`

   Código Interno e EAN são mantidos como texto; zeros iniciais de EAN não são descartados. Validade é exportada como `DD/MM/AAAA`.
5. O clique abre uma **prévia da lista TSV** e tenta enviá-la automaticamente à área de transferência. Se o navegador bloquear a cópia, a prévia permanece aberta com o texto selecionado para usar `Ctrl+C`. Também há **Copiar novamente** e **Selecionar tudo**. O fallback de cópia foi corrigido para funcionar dentro do modal aberto, inclusive no Brave.
6. Se o ODS/CSV ainda não foi importado para a loja, a conferência avisa que é necessário importar o estoque primeiro. Não é permitido copiar dados sem conferência válida.

### Tabelas responsivas

- Listagens continuam como **linhas**, e **não** cards independentes.
- Em telas amplas são tabelas tradicionais com cabeçalho; em telas pequenas cada registro é uma **faixa contínua**, exibindo os campos essenciais em linhas compactas com rótulos pequenos.
- Cabeçalhos das abas internas continuam escritos, como **Mapa de Validade** e **Conferir com estoque**.
- Ícones de ações continuam com título e identificadores acessíveis.
- O quadro de organização por Grupo continua sendo a **única interface de cards por funcionário**.
- O navegador não exige scroll horizontal na página nem nas tabelas para as larguras simuladas de 320, 360, 390, 600, 768, 900, 1024, 1280 e 1600 px.

## Implantação

1. Faça backup do sistema e use uma branch de testes. Atualize o repositório GitHub com os arquivos desta versão.
2. Confirme que as migrações da versão v27 já estão aplicadas. **Não existe nova migração SQL para v28.**
3. Aguarde o deploy no Vercel. O Service Worker tem um novo identificador de cache (`registro-validades-v28-procfit-conferencia-linhas`), de forma que os novos scripts e estilos substituam a versão antiga.
4. Na Loja 151, abra **Mapa de Validade → Conferir com estoque**, selecione o mês e confira o saldo já importado em **Controle de Estoque**.
5. Teste um produto encontrado com saldo inferior ao mapa e um EAN não localizado. O não localizado deve exibir **Estoque 0 / Corrigida 0** e não constar no arquivo copiado.
6. Clique **Copiar para Conector Procfit — v1.0**. Confirme a prévia e cole em um campo de importação de teste do seu Conector. Se o navegador impedir a cópia automática, selecione e use `Ctrl+C`. **Não execute movimentações definitivas no Procfit durante a homologação.**
7. Confira o layout em celular e computador. As opções de navegação internas devem continuar com texto.

## Validação

- 234 testes JavaScript aprovados, incluindo as regras de conferência, Procfit e exclusão de itens de saldo zero.
- 24 testes Python aprovados.
- Verificação de dimensões via Chromium local com HTML de demonstração e CSS atualizado, nas larguras de 320 a 1600 px, sem scroll horizontal nos cenários testados.

**Limite:** não houve conexão ao Supabase ou Procfit real. A integração de clipboard depende das permissões do navegador, por isso existe a prévia com fallback manual. Teste antes da publicação em produção.
