# Verificações realizadas na montagem do pacote

Data: 09/11/2026

## Passaram

- Sintaxe de `api/index.js` e `public/assets/app.js` validada por Node.js.
- 9 testes automatizados com `node --test` passam: normalização e preservação de zero inicial no EAN, data válida, hash do PIN, status da API sem segredos, API protegida sem sessão, URL por rewrite, origem não autorizada, estruturas SQL RLS e redirect GitHub Pages.
- `scripts/importar_dados.py` em modo seco: 82.498 produtos com EAN válido, 474 produtos preservados em pendências; 1.297 mapas válidos, 2 registros pendentes; 17 contas, 33 vencidos, 1 Queima, 45 eventos e 21 transferências para revisão.
- Arquivos de redirecionamento preparados para o endereço raiz e páginas HTML antigas; `config.js` centraliza destino.
- `private_data/` excluída de Git por `.gitignore`.

## Não foi possível validar neste ambiente

- Requisições reais ao projeto Supabase: nenhuma URL/chave fornecida.
- Implantação efetiva no Vercel e publicação do GitHub Pages: nenhum projeto/domínio foi identificado nesta solicitação.
- Fluxos com OneSignal, Procfit, importação ODS pelo navegador, celular próprio e recursos administrativos legados não implementados integralmente.
- Testes completos em navegador/mobile com base de produção.

**Não publicar a versão como substituta de produção antes da homologação indicada no README.**
