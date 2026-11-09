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
import json
import os
import re
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


# O Storage devolve o motivo em JSON. Mostramos APENAS codigos conhecidos,
# nunca a mensagem livre (ela pode conter URLs, valores ou identificadores).
KNOWN_STORAGE_ERRORS = {
    'InvalidJWT': 'credencial JWT ausente, invalida ou incompativel com este endpoint.',
    'InvalidRequest': 'formato de requisicao nao aceito pelo Storage.',
    'MissingParameter': 'falta um parametro exigido pelo endpoint.',
    'InvalidBucketName': 'nome do bucket invalido.',
    'InvalidKey': 'caminho do objeto invalido.',
    'NoSuchBucket': 'bucket nao encontrado neste projeto.',
    'NoSuchKey': 'arquivo nao encontrado neste bucket/caminho.',
    'AccessDenied': 'chave ou usuario sem acesso ao objeto privado.',
    'Unauthorized': 'requisicao nao autorizada.',
    'InvalidSignature': 'token/assinatura de download invalido.',
    'InvalidAPIKey': 'chave API invalida ou de outro projeto.',
}


def storage_error_code(exc: urllib.error.HTTPError) -> str | None:
    try:
        raw = exc.read(4096)
        obj = json.loads(raw.decode('utf-8', 'replace'))
    except (ValueError, UnicodeError, OSError):
        return None
    if not isinstance(obj, dict):
        return None
    for key in ('code', 'errorCode', 'error_code', 'error'):
        value = obj.get(key)
        if isinstance(value, str) and value in KNOWN_STORAGE_ERRORS:
            return value
    # Algum gateway envia o codigo somente como texto na mensagem.
    msg = obj.get('message')
    if isinstance(msg, str):
        for code in KNOWN_STORAGE_ERRORS:
            if re.search(r'\b' + re.escape(code) + r'\b', msg):
                return code
    return None


def http_failure(exc: urllib.error.HTTPError, source: str) -> str:
    code = exc.code
    storage_code = storage_error_code(exc)
    detail = f'; codigo Storage: {storage_code}' if storage_code else '; codigo Storage nao informado'
    if storage_code:
        reason = KNOWN_STORAGE_ERRORS[storage_code]
    elif code == 400:
        reason = 'requisicao recusada; confirme endpoint, projeto, bucket e credencial.'
    elif code == 401:
        reason = 'autenticacao recusada; confira chave API e projeto.'
    elif code == 403:
        reason = 'acesso ao objeto privado negado.'
    elif code == 404:
        reason = 'bucket ou arquivo nao encontrado; esperado migracao/dados-migracao.zip.'
    elif code == 410:
        reason = 'link temporario expirado ou revogado.'
    elif code == 413:
        reason = 'arquivo excede tamanho permitido.'
    elif code == 429:
        reason = 'limite de requisicoes atingido.'
    elif 500 <= code <= 599:
        reason = 'falha temporaria no Supabase.'
    else:
        reason = 'verifique a configuracao de acesso ao Storage.'
    return f'HTTP {code} ({source}){detail}; {reason}'


def download(url: str, headers: dict[str, str], source: str) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read(MAX_DOWNLOAD + 1)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(http_failure(exc, source)) from None
    except urllib.error.URLError:
        raise RuntimeError('Falha de rede/DNS/TLS no download; confira conexao e projeto.') from None
    except TimeoutError:
        raise RuntimeError('Tempo esgotado no download; execute novamente.') from None
    if len(payload) > MAX_DOWNLOAD:
        raise RuntimeError('Pacote privado excede o limite de 120 MB.')
    return payload


def signed_url_for_private_object(object_url: str, headers: dict[str, str]) -> str:
    """Solicita assinatura curta sem publicar o token e valida o host de destino."""
    path_token = '/storage/v1/object/authenticated/'
    if path_token not in object_url:
        raise RuntimeError('Endereco do objeto nao tem formato esperado do Supabase Storage.')
    signed_endpoint = object_url.replace(path_token, '/storage/v1/object/sign/', 1)
    sign_headers = dict(headers)
    sign_headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(signed_endpoint, data=b'{"expiresIn":300}',
                                 headers=sign_headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read(16 * 1024)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(http_failure(exc, 'geracao do link temporario')) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('Falha de conexao ao solicitar URL temporaria.') from None
    try:
        data = json.loads(raw)
        signed_path = data.get('signedURL') or data.get('signedUrl')
    except (ValueError, AttributeError):
        signed_path = None
    if not isinstance(signed_path, str) or not signed_path:
        raise RuntimeError('Storage nao devolveu signedURL valido.')
    parsed_source = urllib.parse.urlsplit(object_url)
    # Supabase frequentemente retorna /object/sign/..., sem prefixo /storage/v1.
    if signed_path.startswith('/object/'):
        signed_path = '/storage/v1' + signed_path
    signed = urllib.parse.urljoin(f'{parsed_source.scheme}://{parsed_source.netloc}', signed_path)
    target = urllib.parse.urlsplit(signed)
    if (target.scheme != 'https' or target.netloc != parsed_source.netloc
            or not target.path.startswith('/storage/v1/object/sign/') or not target.query):
        raise RuntimeError('Storage devolveu URL temporaria com destino inesperado.')
    return signed


def download_with_storage_fallback(object_url: str, headers: dict[str, str]) -> bytes:
    """Para sb_secret_ usa link temporario; tenta download direto se necessario."""
    if headers.get('apikey', '').startswith('sb_secret_'):
        try:
            signed_url = signed_url_for_private_object(object_url, headers)
            print('URL temporaria de acesso ao objeto gerada.', flush=True)
            return download(signed_url, {'User-Agent': headers['User-Agent']}, 'URL temporaria')
        except RuntimeError as first_error:
            print('Metodo de URL temporaria indisponivel; testando download autenticado.', flush=True)
            try:
                return download(object_url, headers, 'bucket privado')
            except RuntimeError as second_error:
                raise RuntimeError(f'Falha da assinatura: {first_error}; falha do acesso direto: {second_error}') from None
    return download(object_url, headers, 'bucket privado')


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
        bundle = (download_with_storage_fallback(url, headers)
                  if source == 'bucket privado' else download(url, headers, source))
        count = extract(bundle)
        print(f'Pacote privado validado: {count} arquivos. Dados não serão publicados no GitHub.')
        return 0
    except (ValueError, RuntimeError, zipfile.BadZipFile, OSError) as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
