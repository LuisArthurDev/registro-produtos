# V47 — Diagnóstico do erro Supabase ao conferir aprovações do relatório Procfit

Erro relatado na v46: **`Não foi possível conferir: Falha na comunicação com o Supabase. Verifique a conexão e tente novamente. (referência: A373651C)`**.

## O que foi identificado

O frontend encaminha os itens marcados com **S** ao endpoint `/queima/conciliar-relatorio` com `simular:true`. O servidor chama a função **`public.conciliar_queima_relatorio_v43`** no Supabase. A versão anterior converte QUALQUER erro HTTP 500 do banco em `502`, escondendo o código SQL do usuário e exibindo apenas a frase genérica.

**Não foi possível consultar os logs do Vercel da referência `A373651C` neste ambiente.** Portanto, a origem precisa (SQL, indisponibilidade ou tempo de execução) ainda não foi comprovada. Esta v47 corrige a falta de diagnóstico e preserva o comportamento do sistema, para permitir identificar o erro sem gravar produtos.

## O que muda

- A API agora registra nos logs do Vercel a função/RPC, o HTTP de origem, **SQLSTATE** e a mensagem de erro SQL (limitada, sem enviar dados do arquivo ou credenciais).
- Para erros conhecidos, retorna uma causa clara: `42702` referência ambígua, `42703` coluna inexistente, `42883` função incompatível, `23502` campo obrigatório, `23505` duplicidade ou `57014` limite de tempo.
- Diferencia **timeout** (`504`) de erro SQL ou comunicação (`502`).
- Quando a conferência completa falha, a interface mantém **Confirmar desabilitado** e testa **exatamente uma linha**, ainda com `simular:true`. O modal mostra se uma linha funciona e o arquivo completo falha (possível limite de volume ou erro em outra linha) ou se a função falha até com uma linha (possível migração/SQL).
- A funcionalidade **Sugestões sem responsável**, badges, primeira carga, correções futuras e todas as regras operacionais da v46 permanecem inalteradas.
- **Sem migração SQL nesta entrega.** Não há operações novas de INSERT/UPDATE/DELETE nem alteração do estado de aprovação na conferência.

## Para encontrar a causa exata agora (sem instalar nada)

1. Abra seu projeto no **Vercel**, entre em **Logs** e pesquise a referência `A373651C`.
2. Procure a linha `POST /api/index.js` com o erro do Supabase (ou a mensagem PostgreSQL presente no campo `- Error: ...`).
3. Anote somente o **SQLSTATE** e a **mensagem de erro**, sem compartilhar tokens, URL privada do projeto, credenciais ou dados pessoais.

O código anterior já registrava a mensagem original para erros 5xx da API, mas não a exibia na interface. Após instalar v47, tente **Conferir** novamente: o modal passará a exibir o SQLSTATE reconhecido e tentará um diagnóstico de uma linha, sem gravar.

## Implantação

1. Faça backup do repositório.
2. Se já estiver na **v46**, extraia `atualizacao-v47-diagnostico-conciliacao-sobre-v46.zip` sobre o projeto, substituindo arquivos. Alternativamente, instale o projeto completo.
3. Publique no GitHub e confirme o deploy no Vercel **da API e do frontend** (a alteração do servidor é fundamental).
4. Recarregue a PWA para atualizar o cache `registro-validades-v47-diagnostico-conciliacao-supabase`.
5. Abra **Queima → Conferir aprovações no relatório Procfit** e tente novamente. Copie a mensagem exibida no modal e o SQLSTATE/referência.

**Atenção:** a v47 é uma atualização de diagnóstico, **não** corrige automaticamente uma SQL danificada nem amplia o limite de tempo configurado no Supabase. Se o diagnóstico apontar uma dessas causas, o reparo específico deverá ser aplicado ao banco. Não clique em **Confirmar** enquanto a prévia completa falhar.

## Testes locais

- `npm run check`: **355 testes JavaScript aprovados** (inclui cenários simulados de erro PostgreSQL, timeout, comunicação e garantia de que a prévia não grava).
- `python -m unittest discover -s tests -p 'testar*.py' -q`: **24 testes Python aprovados**.

A execução do Vercel e o Supabase reais não foram acessados: somente os testes locais foram executados.
