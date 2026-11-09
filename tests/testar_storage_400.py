"""Diagnostico do HTTP 400 e do fluxo de URL temporaria (sem rede)."""
import importlib.util
import io
import json
from pathlib import Path
from unittest import TestCase, mock
import urllib.error

MODULE = Path(__file__).parents[1] / 'scripts/baixar_dados_privados.py'
spec = importlib.util.spec_from_file_location('storage_loader', MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FakeResponse:
    def __init__(self, data): self.data = data
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, *args): return self.data


class TestStorage400(TestCase):
    def config(self):
        return mod.request_config({'SUPABASE_URL':'https://exemplo.supabase.co',
                                   'SUPABASE_SECRET_KEY':'sb_secret_FAKE'})

    def test_http_400_extracts_only_safe_error_code(self):
        err = urllib.error.HTTPError('https://host/?token=SECRET', 400, 'bad', {}, io.BytesIO(
            json.dumps({'code':'InvalidJWT', 'message':'TOKEN_SECRET deve ser guardado'}).encode()))
        result = mod.http_failure(err, 'bucket privado')
        self.assertIn('HTTP 400', result)
        self.assertIn('InvalidJWT', result)
        self.assertNotIn('TOKEN_SECRET', result)

    def test_generate_signed_url_with_same_host(self):
        url, headers, _ = self.config()
        with mock.patch.object(mod.urllib.request, 'urlopen', return_value=FakeResponse(
                b'{"signedURL":"/object/sign/migracao/dados-migracao.zip?token=SECRET"}')) as opener:
            signed = mod.signed_url_for_private_object(url, headers)
        self.assertEqual(opener.call_args.args[0].get_method(), 'POST')
        self.assertEqual(signed, 'https://exemplo.supabase.co/storage/v1/object/sign/migracao/dados-migracao.zip?token=SECRET')

    def test_rejects_offsite_signed_urls(self):
        url, headers, _ = self.config()
        with mock.patch.object(mod.urllib.request, 'urlopen', return_value=FakeResponse(
                b'{"signedURL":"https://evil.invalid/steal?token=SECRET"}')):
            with self.assertRaisesRegex(RuntimeError, 'destino inesperado'):
                mod.signed_url_for_private_object(url, headers)

    def test_fallback_download(self):
        url, headers, _ = self.config()
        with mock.patch.object(mod, 'signed_url_for_private_object', side_effect=RuntimeError('HTTP 400; codigo Storage InvalidJWT')):
            with mock.patch.object(mod, 'download', return_value=b'ZIP') as getter:
                self.assertEqual(mod.download_with_storage_fallback(url, headers), b'ZIP')
                self.assertEqual(getter.call_args.args[2], 'bucket privado')
