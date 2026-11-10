# Administrador Geral — alterar minha senha

1. Publique os arquivos atualizados no mesmo repositório; não altere o ID ou PIN em scripts ou HTML.
2. Em GitHub Actions → **Supabase - preparar e importar**, execute a etapa `pin_administrador_geral` (somente a migração SQL aditiva 007; não mexe em mapas, loja ou catálogo).
3. Confirme o deploy no Vercel.
4. Entre como Administrador Geral → **Painel Geral** → **Alterar minha senha**.
5. Digite o PIN atual, o novo PIN numérico de 6 a 12 dígitos e a confirmação. Salve.
6. As demais sessões são encerradas automaticamente; a sessão atual permanece ativa.

A autenticação continua por PIN próprio do sistema no Supabase (não Supabase Auth).
Não compartilhe seu PIN nem registre-o nos logs. Tentativas incorretas consecutivas
ativam bloqueio temporário de 15 minutos. O administrador de loja não possui essa ação
no Painel Geral, pois não acessa o Painel Geral.
