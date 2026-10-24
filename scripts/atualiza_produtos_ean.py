
#!/usr/bin/env python3

import json
import os
import sys
from pathlib import Path

import pandas as pd


# Localiza a raiz do repositório no GitHub Actions ou localmente.
if os.environ.get("GITHUB_WORKSPACE"):
    ROOT = Path(os.environ["GITHUB_WORKSPACE"])
else:
    ROOT = Path(__file__).resolve().parents[1]

ITEMS_PATH = ROOT / "Items.XLS"
JSON_PATH = ROOT / "produtos_ean.json"


def normalize(value) -> str:
    """Normaliza valores sem transformar valores vazios em 'nan'."""
    if value is None or pd.isna(value):
        return ""

    if isinstance(value, float) and value.is_integer():
        value = int(value)

    return " ".join(str(value).split()).strip()


def normalize_key(value: str) -> str:
    return normalize(value).upper()


def build_item_map() -> dict[str, dict[str, str]]:
    """Lê código interno, EAN, descrição e seção do arquivo Excel."""
    if not ITEMS_PATH.exists():
        raise FileNotFoundError(
            f"Arquivo Excel não encontrado: {ITEMS_PATH}"
        )

    df = pd.read_excel(
        ITEMS_PATH,
        header=None,
        usecols="A:D",
        dtype=str,
        engine="xlrd",
        keep_default_na=False,
    )

    item_map = {}

    for _, row in df.iterrows():
        codigo_interno = normalize(row.iloc[0])
        ean = normalize(row.iloc[1])
        descricao = normalize(row.iloc[2])
        secao = normalize(row.iloc[3])

        if not any((codigo_interno, ean, descricao, secao)):
            continue

        # Ignora o cabeçalho, caso exista.
        if normalize_key(codigo_interno) in {
            "CODIGO INTERNO",
            "CÓDIGO INTERNO",
        }:
            continue

        registro = {
            "codigoInterno": codigo_interno,
            "produto": descricao,
            "secao": secao,
        }

        if ean:
            # O JSON continuará sendo indexado pelo EAN.
            item_map[normalize_key(ean)] = registro

    return item_map


def main():
    if not JSON_PATH.exists():
        raise FileNotFoundError(
            f"Arquivo JSON não encontrado: {JSON_PATH}"
        )

    with JSON_PATH.open("r", encoding="utf-8-sig") as file:
        original = json.load(file)

    if not isinstance(original, dict):
        raise ValueError(
            "O produtos_ean.json precisa ser um objeto JSON indexado por EAN."
        )

    item_map = build_item_map()
    converted = {}

    # Preserva os produtos que já existem no JSON.
    for ean_original, value in original.items():
        ean = normalize(ean_original)

        if isinstance(value, dict):
            produto = normalize(
                value.get("produto") or value.get("nome") or ""
            )
            secao = normalize(value.get("secao") or "")
            codigo_interno = normalize(
                value.get("codigoInterno")
                or value.get("codigo_interno")
                or ""
            )
        else:
            produto = normalize(value)
            secao = ""
            codigo_interno = ""

        # O Excel complementa os dados do JSON.
        registro_excel = item_map.get(normalize_key(ean))

        if registro_excel:
            codigo_interno = (
                codigo_interno or registro_excel["codigoInterno"]
            )
            produto = produto or registro_excel["produto"]
            secao = secao or registro_excel["secao"]

        converted[ean] = {
            "codigoInterno": codigo_interno,
            "produto": produto,
            "secao": secao,
        }

    # Grava o JSON atualizado.
    with JSON_PATH.open("w", encoding="utf-8") as file:
        json.dump(
            converted,
            file,
            ensure_ascii=False,
            indent=2,
        )
        file.write("\n")

    print(f"Arquivo atualizado: {JSON_PATH}")
    print(f"Produtos no JSON: {len(converted)}")
    print(f"EANs encontrados no Excel: {len(item_map)}")

    encontrados = sum(
        1
        for ean in converted
        if normalize_key(ean) in item_map
    )

    print(f"Produtos correspondentes: {encontrados}")
    print("Conversão concluída com sucesso!")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
