#!/usr/bin/env python3
"""Baixa pacote ZIP privado de migração e extrai arquivos autorizados.

Segurança:
- Não imprime URL assinada, URL de projeto com querystring, tokens ou chaves.
- Diagnósticos por status HTTP, sem exibir corpo da resposta do servidor.
- Compatível com chaves Supabase modernas sb_secret_ e legadas service_role JWT.
- Impõe limites a download, total descompactado e caminhos do ZIP.
"""
from __future__ import annotations

import io
import os
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'private_data'
MAX_DOWNLOAD = 120 * 1024 * 1024
MAX_EXTRACT = 250 * 1024 * 1024
ALLOWED = {
    'auditoria.csv', 'mapa_lancamentos.csv', 'usuarios_sem_senhas.csv',
    'vencidos.csv', 'queima.csv', 'transferencias_REVISAR.csv',
    'inconsistencias.csv', 'manifest.json', 'produtos_ean.db',
    'estoque_especial.csv',
}
# O pacote privado fornecido inclui este aviso. Validamos e ignoramos, sem extraí-lo.
IGNORED = {'LEIA-ME-NAO-PUBLICAR.txt'}
REQUIRED = {
    'auditoria.csv', 'mapa_lancamentos.csv', 'usuarios_sem_senhas.csv',
    'vencidos.csv', 'queima.csv', 'transferencias_REVISAR.csv',
    'produtos_ean.db',
}


def request_config(environ=None):
    env = os.environ if environ is None else environ
    base = (env.get('SUPABASE_URL') or '').strip().rstrip('/')
    secret = (env.get('SUPABASE_SECRET_KEY') or '').strip()
    signed = (env.get('MIGRATION_BUNDLE_URL') or '').strip()

    if signed:
        parsed = urllib.parse.urlsplit(signed)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError('MIGRATION_BUNDLE_URL deve ser uma URL HTTPS válida.')
        return signed, {'User-Agent': 'registro-validades-import/1.1'}, 'URL assinada'

    if not base.startswith('https://') or not secret:
        raise ValueError('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no GitHub Actions.')
    parsed = urllib.parse.urlsplit(base)
    if not parsed.netloc or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('SUPABASE_URL deve ser somente a URL HTTPS do projeto, sem caminhos.')
    if secret.startswith('sb_publishable_'):
        raise ValueError('SUPABASE_SECRET_KEY contém uma chave pública. Use a chave sb_secret_ do Supabase.')

    bucket = (env.get('MIGRATION_STORAGE_BUCKET') or 'migracao').strip()
    object_name = (env.get('MIGRATION_STORAGE_OBJECT') or 'dados-migracao.zip').strip()
    if not bucket.isascii() or not bucket.replace('-','').replace('_','').isalnum():
        raise ValueError('Nome do bucket de migração inválido.')
    if object_name != 'dados-migracao.zip':
        raise ValueError('O arquivo esperado nesta versão é dados-migracao.zip.')

    url = (f'{base}/storage/v1/object/authenticated/'
           f'{urllib.parse.quote(bucket, safe="")}/{urllib.parse.quote(object_name, safe="")}')
    headers = {'apikey': secret, 'User-Agent': 'registro-validades-import/1.1'}
    # Uma chave moderna sb_secret_ não é JWT: nunca enviá-la como Bearer.
    # Uma chave service_role legada JWT requer Authorization: Bearer.
    if secret.count('.') == 2:
        headers['Authorization'] = 'Bearer ' + secret
    return url, headers, 'bucket privado'


def http_failure(exc: urllib.error.HTTPError, source: str) -> str:
    code = exc.code
    if code == 400:
        reason = 'requisição inválida; confirme o projeto, bucket e nome do objeto.'
    elif code == 401:
        reason = ('autenticação recusada; confira SUPABASE_SECRET_KEY (chave secreta sb_secret_, '
                  'não a chave pública) e se pertence ao mesmo projeto de SUPABASE_URL.')
    elif code == 403:
        reason = 'acesso negado; confira a autorização da chave para o Storage privado.'
    elif code == 404:
        reason = ('arquivo ou bucket não encontrado; confira Storage → migracao → '
                  'dados-migracao.zip (na raiz do bucket, sem pasta adicional).')
    elif code == 410:
        reason = 'recurso não disponível; se usou URL assinada, gere outra URL.'
    elif code == 413:
        reason = 'arquivo excede o tamanho permitido pela API.'
    elif code == 429:
        reason = 'limite de requisições; tente novamente mais tarde.'
    elif 500 <= code <= 599:
        reason = 'falha temporária no serviço Supabase; tente novamente.'
    else:
        reason = 'verifique configurações de armazenamento e autenticação.'
    if source == 'URL assinada' and code in (400, 401, 403, 404):
        reason += ' A URL assinada pode ter expirado ou estar incorreta.'
    return f'Falha ao baixar pacote privado: HTTP {code} ({source}); {reason}'


def download(url: str, headers: dict[str, str], source: str) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read(MAX_DOWNLOAD + 1)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(http_failure(exc, source)) from None
    except urllib.error.URLError:
        raise RuntimeError('Falha de rede/DNS/TLS ao baixar pacote privado; verifique o acesso ao projeto.') from None
    except TimeoutError:
        raise RuntimeError('Tempo esgotado ao baixar pacote privado; tente executar o workflow novamente.') from None
    if len(payload) > MAX_DOWNLOAD:
        raise RuntimeError('Pacote privado excede o limite de 120 MB.')
    return payload


def extract(bundle: bytes, destination: Path = DATA) -> int:
    try:
        z = zipfile.ZipFile(io.BytesIO(bundle))
    except zipfile.BadZipFile:
        raise RuntimeError('O arquivo baixado não é um ZIP válido.') from None

    accepted = {}
    ignored_seen = set()
    total = 0
    for item in z.infolist():
        if item.is_dir():
            continue
        name = item.filename.replace('\\', '/')
        segments = name.split('/')
        if len(segments) != 2 or segments[0] != 'private_data':
            raise RuntimeError('O ZIP contém caminhos fora de private_data/.')
        filename = segments[1]
        if filename not in ALLOWED | IGNORED:
            raise RuntimeError('O ZIP contém um nome de arquivo não autorizado.')
        if stat.S_ISLNK(item.external_attr >> 16):
            raise RuntimeError('Links simbólicos não são permitidos no ZIP.')
        if filename in accepted or filename in ignored_seen:
            raise RuntimeError('O ZIP contém arquivos duplicados.')
        total += item.file_size
        if total > MAX_EXTRACT:
            raise RuntimeError('O conteúdo descompactado excede 250 MB.')
        if filename in IGNORED:
            ignored_seen.add(filename)
        else:
            accepted[filename] = item
    missing = REQUIRED - accepted.keys()
    if missing:
        raise RuntimeError('Faltam arquivos obrigatórios no pacote: ' + ', '.join(sorted(missing)))

    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    for filename, info in accepted.items():
        with z.open(info) as src, (destination / filename).open('wb') as out:
            import shutil
            shutil.copyfileobj(src, out)
        (destination / filename).chmod(0o600)
    return len(accepted)


def main() -> int:
    try:
        url, headers, source = request_config()
        print('Obtendo dados de migração do armazenamento privado...', flush=True)
        print(f'Origem: {source}.', flush=True)
        bundle = download(url, headers, source)
        count = extract(bundle)
        print(f'Pacote privado validado: {count} arquivos. Dados não serão publicados no GitHub.')
        return 0
    except (ValueError, RuntimeError, zipfile.BadZipFile, OSError) as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
