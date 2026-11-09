"""Testes offline do download privado do Supabase. Sem rede ou dados reais."""
import importlib.util
import io
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent / 'scripts/baixar_dados_privados.py'
spec = importlib.util.spec_from_file_location('baixar_dados_privados', MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TestDownloader(unittest.TestCase):
    def test_modern_key_uses_apikey_not_bearer(self):
        env = {'SUPABASE_URL': 'https://example.supabase.co',
               'SUPABASE_SECRET_KEY': 'sb_secret_fake_do_not_use'}
        url, headers, source = mod.request_config(env)
        self.assertEqual(source, 'bucket privado')
        self.assertEqual(url, 'https://example.supabase.co/storage/v1/object/authenticated/migracao/dados-migracao.zip')
        self.assertEqual(headers['apikey'], env['SUPABASE_SECRET_KEY'])
        self.assertNotIn('Authorization', headers)

    def test_legacy_key_has_bearer(self):
        env = {'SUPABASE_URL': 'https://example.supabase.co',
               'SUPABASE_SECRET_KEY': 'header.payload.signature'}
        _, headers, _ = mod.request_config(env)
        self.assertEqual(headers['Authorization'], 'Bearer header.payload.signature')

    def test_public_key_rejected(self):
        with self.assertRaisesRegex(ValueError, 'chave pública'):
            mod.request_config({'SUPABASE_URL': 'https://example.supabase.co',
                                'SUPABASE_SECRET_KEY': 'sb_publishable_fake'})

    def test_signed_url_has_priority_and_not_logged(self):
        env = {'SUPABASE_URL': 'https://example.supabase.co',
               'SUPABASE_SECRET_KEY': 'sb_secret_hidden',
               'MIGRATION_BUNDLE_URL': 'https://example.org/hidden?token=supersecret'}
        url, headers, source = mod.request_config(env)
        self.assertIn('token=supersecret', url)
        self.assertEqual(source, 'URL assinada')
        self.assertNotIn('apikey', headers)
        self.assertNotIn('Authorization', headers)

    def test_http_error_codes_are_helpful_without_echoing_secret(self):
        for code in [400, 401, 403, 404, 410, 429, 500]:
            error = urllib.error.HTTPError('https://example.org/?secret=DO_NOT_PRINT', code,
                                           'DO_NOT_PRINT', {}, None)
            msg = mod.http_failure(error, 'bucket privado')
            self.assertIn(f'HTTP {code}', msg)
            self.assertNotIn('DO_NOT_PRINT', msg)
        error = urllib.error.HTTPError('https://x', 404, 'No', {}, None)
        self.assertIn('dados-migracao.zip', mod.http_failure(error, 'bucket privado'))

    def test_original_bundle_file_structure_accepted_with_readme(self):
        def make_zip():
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w') as z:
                for item in sorted(mod.REQUIRED):
                    z.writestr('private_data/' + item, b'dados de teste')
                z.writestr('private_data/LEIA-ME-NAO-PUBLICAR.txt', 'aviso')
            return buf.getvalue()
        with tempfile.TemporaryDirectory() as d:
            count = mod.extract(make_zip(), Path(d))
            self.assertEqual(count, len(mod.REQUIRED))
            self.assertFalse((Path(d)/'LEIA-ME-NAO-PUBLICAR.txt').exists())
            self.assertTrue((Path(d)/'produtos_ean.db').exists())

    def test_unsafe_path_rejected_without_extracting(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            for item in mod.REQUIRED:
                z.writestr('private_data/'+item, b'ok')
            z.writestr('other/secrets.txt', b'no')
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(RuntimeError, 'fora de private_data'):
                mod.extract(buf.getvalue(), Path(d))
            self.assertEqual(list(Path(d).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
