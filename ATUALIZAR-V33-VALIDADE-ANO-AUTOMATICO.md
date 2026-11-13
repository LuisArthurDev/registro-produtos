# V33 — Ano da validade sem digitar barra

## Correção

Na tela **Lançamentos**, o campo **Validade** insere automaticamente a segunda barra quando o operador começa a informar o ano após `DD/MM`.

Por exemplo, ao digitar **30112026**, o campo mostra progressivamente:

```text
3
30
30/1
30/11
30/11/2
30/11/20
30/11/202
30/11/2026
```

Assim, não é necessário digitar `/` depois do mês. O campo continua aceitando anos com **dois dígitos** (`301126` → `30/11/26`), datas com barras digitadas/coladas e a forma abreviada **mês/ano** (`01/26` ou `12/2026`). A data é convertida para `AAAA-MM-DD` somente na gravação, mantendo a validação de dias e meses existentes.

## Arquivos modificados

- `public/assets/validade.js`: máscara que reconhece a primeira barra e acrescenta a segunda sem descartar dígitos do ano.
- `public/assets/app.js`: instrução de preenchimento com exemplo numérico.
- `public/sw.js`: novo identificador de cache para recarregar a PWA.
- `tests/validade-mascara-ano-automatico-v33.test.js`: cenários de digitação contínua, barras e exclusão de dígitos.
- Testes com expectativa de cache atualizados para a versão v33.

## Instalação

1. Faça backup do repositório e aplique os arquivos da atualização sobre a **v32**. Ou utilize o projeto completo v33.
2. Publique o código no GitHub e confirme o deploy no Vercel.
3. Recarregue a PWA/aba do navegador para ativar a nova versão.
4. Abra **Lançamentos**, digite `30112026` no campo Validade e confira `30/11/2026`. Registre um produto de teste e verifique que a validade foi persistida corretamente.

**Não há migração SQL nesta versão.** O Mapa de Destino persistente e a descida de Estoque em lote da v32 foram preservados.

## Testes

- **263 testes JavaScript** aprovados.
- **24 testes Python** aprovados.
- Chromium local: entrada numérica de 8 dígitos, entrada de 6 dígitos, mês/ano, backspace e colagem com primeira barra.

A alteração foi validada localmente. Não foi realizada uma gravação real no Supabase de produção.
