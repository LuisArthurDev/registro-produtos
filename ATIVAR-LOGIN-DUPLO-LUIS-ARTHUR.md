# V18 — Login Luis Arthur como Administrador de Loja + Administrador Geral

Esta atualização permite **um único login com o mesmo PIN existente** e dois modos de acesso:

- **Administrador de Loja**: ações no Painel Conferente da própria loja (151), sem permissão para agir em outra loja.
- **Administrador Geral**: Painel Geral, gestão de lojas e administradores. A elevação de perfil exige novamente o PIN atual, sem trocar ou duplicar a senha. A elevação vence em **30 minutos**. O botão permite retornar ao Painel Conferente imediatamente.

O perfil persistente no banco permanece `admin`, com a permissão adicional `acesso_geral`. O servidor calcula o perfil ativo em cada requisição com base na sessão autenticada: não aceita que o navegador altere `perfil` ou `loja` arbitrariamente. Usuários comuns não veem o botão.

## Instalar de maneira segura

1. Faça backup do Supabase e salve uma cópia da versão atualmente publicada. Recomenda-se testar primeiro numa branch de homologação.
2. **Antes de executar a SQL**, confira no Supabase SQL Editor quem será afetado:

```sql
select id, nome, loja_id, perfil, ativo
from public.usuarios
where nome_normalizado='luis arthur' and loja_id='151';
```

3. Confirme que existe **exatamente uma conta ativa** e que ela é o login correto. Se sua loja ou cadastro não forem `151`/`luis arthur`, **não execute a migração sem atualizar cuidadosamente os critérios** no arquivo `supabase/011_luis_arthur_duplo_perfil.sql`. A SQL interrompe tudo caso não encontre exatamente uma conta elegível.
4. Envie os arquivos atualizados ao **mesmo repositório GitHub**. Em **Actions → Supabase - preparar e importar → Run workflow**, escolha `etapa = habilitar_duplo_perfil`.
5. Essa etapa executa `supabase/011_luis_arthur_duplo_perfil.sql` com a conexão privada `SUPABASE_DB_URL` já usada pelas migrações. Não importa produtos/mapas nem reinicia PINs. As sessões antigas da conta de destino são encerradas de propósito.
6. Aguarde o deploy Vercel e feche/reabra a PWA. Entre com **Luis Arthur**, **Loja 151**, e o **PIN habitual**. A conta entrará como Administrador de Loja.
7. Use **Acessar Painel Geral** na barra superior (inclusive no celular, dentro de Lançamentos). Digite **o mesmo PIN** para habilitar o Geral. Para voltar, clique em **← Painel Conferente**. No celular, a entrada inicial continua em `lancamentos.html`; o retorno explícito ao painel é permitido.
8. Teste também outro funcionário e um administrador comum: eles **não** devem ter acesso ao Geral. Confirme que o Geral consegue listar lojas e que, depois de voltar à loja, o sistema só acessa a loja 151.

## Observações

- A migração **não** muda o PIN: mantém o hash scrypt já salvo. Nenhuma senha é incluída no código, workflow ou arquivos de log.
- O cadastro antigo de Administrador Geral (se houver) **não é excluído ou desativado automaticamente**. Só o desative após homologar o acesso duplo para não perder uma conta de recuperação.
- O usuário pode mudar seu PIN pelo botão **Alterar minha senha** enquanto estiver no modo Geral; isso também afetará o login administrativo da loja, porque é a **mesma conta**.
- Qualquer problema em `habilitar_duplo_perfil` significa que **nenhuma alteração na conta foi confirmada**, pois a migração é transacional. Corrija a identificação e repita somente após conferir o cadastro.
- Esta entrega foi validada por testes automatizados com banco simulado; **não alterei o seu Supabase real e não tive acesso ao PIN**.
