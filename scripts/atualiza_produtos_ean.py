
#!/usr/bin/env python3

import json
import os
import sys
from pathlib import Path

import pandas as pd


# Localiza a raiz do repositório no GitHub Actions.
if os.environ.get("GITHUB_WORKSPACE"):
    ROOT = Path(os.environ["GITHUB_WORKSPACE"])
else:
    ROOT = Path(__file__).resolve().parents[1]

ITEMS_PATH = ROOT / "Items.ods"
JSON_PATH = ROOT / "produtos_ean.json"


def normalize(value) -> str:
    """Converte valores em texto e remove espaços desnecessários."""
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    # Evita representar números inteiros como 12345.0.
    if isinstance(value, float) and value.is_integer():
        value = int(value)

    return " ".join(str(value).split()).strip()


def normalize_key(value: str) -> str:
    """Normaliza chaves para comparação."""
    return normalize(value).upper()


def build_item_map() -> dict[str, dict[str, str]]:
    """
    Lê Items.ods:
    Coluna A = Código Interno
    Coluna B = EAN
    Coluna C = Descrição
    Coluna D = Seção

    Indexa os registros pelo EAN.
    """
    if not ITEMS_PATH.is_file():
        raise FileNotFoundError(
            f"Arquivo ODS não encontrado: {ITEMS_PATH}"
        )

    df = pd.read_excel(
        ITEMS_PATH,
        header=None,
        usecols="A:D",
        dtype=str,
        engine="odf",
        keep_default_na=False,
    )

    item_map: dict[str, dict[str, str]] = {}

    for _, row in df.iterrows():
        codigo_interno = normalize(row.iloc[0])
        ean = normalize(row.iloc[1])
        descricao = normalize(row.iloc[2])
        secao = normalize(row.iloc[3])

        # Ignora linhas vazias.
        if not any(
            (codigo_interno, ean, descricao, secao)
        ):
            continue

        # Ignora cabeçalho, se existir.
        if normalize_key(codigo_interno) in {
            "CODIGO INTERNO",
            "CÓDIGO INTERNO",
        }:
            continue

        if not ean:
            continue

        item_map[normalize_key(ean)] = {
            "codigoInterno": codigo_interno,
            "produto": descricao,
            "secao": secao,
        }

    return item_map


def main() -> None:
    if not JSON_PATH.is_file():
        raise FileNotFoundError(
            f"Arquivo JSON não encontrado: {JSON_PATH}"
        )

    with JSON_PATH.open(
        "r",
        encoding="utf-8-sig",
    ) as file:
        original = json.load(file)

    if not isinstance(original, dict):
        raise ValueError(
            "O produtos_ean.json precisa ser um objeto JSON indexado por EAN."
        )

    item_map = build_item_map()
    converted: dict[str, dict[str, str]] = {}

    # Mantém os registros existentes no JSON.
    for ean_original, value in original.items():
        ean = normalize(ean_original)

        if isinstance(value, dict):
            produto = normalize(
                value.get("produto")
                or value.get("nome")
                or value.get("descricao")
                or ""
            )

            secao = normalize(
                value.get("secao") or ""
            )

            codigo_interno = normalize(
                value.get("codigoInterno")
                or value.get("codigo_interno")
                or ""
            )

        else:
            produto = normalize(value)
            secao = ""
            codigo_interno = ""

        # Busca o mesmo EAN no arquivo ODS.
        registro_excel = item_map.get(
            normalize_key(ean)
        )

        if registro_excel:
            # Os dados existentes no JSON são preservados
            # quando já estão preenchidos.
            codigo_interno = (
                codigo_interno
                or registro_excel["codigoInterno"]
            )

            produto = (
                produto
                or registro_excel["produto"]
            )

            secao = (
                secao
                or registro_excel["secao"]
            )

        converted[ean] = {
            "codigoInterno": codigo_interno,
            "produto": produto,
            "secao": secao,
        }

    # Salva o resultado.
    with JSON_PATH.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            converted,
            file,
            ensure_ascii=False,
            indent=2,
        )
        file.write("\n")

    correspondencias = sum(
        1
        for ean in converted
        if normalize_key(ean) in item_map
    )

    print("Conversão concluída!")
    print(f"Arquivo ODS: {ITEMS_PATH}")
    print(f"Arquivo JSON: {JSON_PATH}")
    print(f"Registros no ODS: {len(item_map)}")
    print(f"Registros no JSON: {len(converted)}")
    print(f"EANs correspondentes: {correspondencias}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
