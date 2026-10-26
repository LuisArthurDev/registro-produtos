
const SUPABASE_URL = "https://hmowljkqsulivrgbqvvt.supabase.co";

// Use aqui a chave pública (publishable/anon) do seu projeto.
// NÃO use a chave service_role ou uma chave secreta.
const SUPABASE_ANON_KEY = "sb_publishable_YLxuy4gIHVJbMLyXPUh-4g_0xAgt_Wn";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
