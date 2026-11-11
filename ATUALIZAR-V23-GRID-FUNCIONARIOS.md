# v23 — Funcionários em grid na aba Seções

## O que muda

- Os cartões **Sem responsável** e de **todos os funcionários** usam layout CSS Grid: não existe mais um carrossel horizontal.
- Cada cartão de funcionário apresenta o nome, o total de seções atribuídas e a seção mais frequente, com altura controlada.
- Se houver várias seções, a lista **dentro do cartão** ganha rolagem vertical própria; cabeçalho e resumo permanecem visíveis.
- No celular, os cartões ocupam uma coluna por linha, sem rolagem horizontal.
- Mantém seleção do responsável, drag-and-drop no desktop, sugestões, ocultação/exclusão reversível e restauração existentes na v22.
- As listas internas podem receber foco pelo teclado; use Tab para focar a lista e as teclas de direção para rolar.
- O Service Worker usa uma nova chave de cache para renovar o CSS e o JavaScript na PWA.

## Arquivos modificados

- `public/assets/app.css` — grid responsivo e rolagem vertical interna dos funcionários.
- `public/assets/organizacao-secoes.js` — região interna rolável acessível por teclado.
- `public/sw.js` — versão do cache v23.
- `tests/organizacao-grid-v23.test.js` — validações do novo layout.
- 3 testes legados adaptados à nova chave do cache.
- `README.md` — referência à versão v23.

## Publicação

1. Faça backup do repositório.
2. Substitua os arquivos no GitHub e confirme o deploy no Vercel.
3. Recarregue o site (Ctrl+F5) ou feche e reabra a PWA para atualizar o cache.
4. Abra o Painel Conferente > **Seções** e verifique o grid no computador e no celular.

**Não é necessária migração SQL** para esta atualização. Se o projeto ainda estiver em uma versão anterior à v22, instale as migrações da v22 primeiro.

## Verificações executadas

Testado com CSS real do projeto e navegador Chromium local, usando dados simulados de 14 funcionários: 390, 768, 1280 e 1600 px, sem overflow horizontal e com scroll vertical dentro dos cartões. Os testes automatizados JavaScript e Python foram executados localmente. O Supabase/Vercel real não foi acessado.
