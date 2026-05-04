# -*- coding: utf-8 -*-
"""
Normaliza texto extraído do PDF/chat (see data/import/_raw_compat_extract.txt):
- Remove linhas introdutórias antes do primeiro bloco CÓDIGO:
- Troca lista duplicada de CIDs em 0302040021 por IGUAL_ANTERIOR
- Une colunas CID/descrição desalinhadas em 0301070075 (bloco F900–H910)
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/import/_raw_compat_extract.txt"
OUT = ROOT / "data/import/tabela_compat_fisio.txt"

MALFORMED_TAIL = """F900 
F910 
F920 
F930 
F940 
F980 
G800 
G801 
G802 
G803 
G804 
G808 
G809 
H540 
H900 
H910 
Distúrbios da atividade e da atenção 
Distúrbio de conduta restrito ao contexto familiar 
Distúrbio depressivo de conduta 
Transtorno ligado à angústia de separação 
Mutismo eletivo 
Enurese de origem não-orgânica 
Paralisia cerebral quadriplágica espástica 
Paralisia cerebral diplégica espástica 
Paralisia cerebral hemiplégica espástica 
Paralisia cerebral discinética 
Paralisia cerebral atáxica 
Outras formas de paralisia cerebral 
Paralisia cerebral não especificada 
Cegueira, ambos os olhos 
Perda de audição bilateral devida a transtorno de condução 
Perda de audição ototóxica"""

FIXED_TAIL = """F900 Distúrbios da atividade e da atenção
F910 Distúrbio de conduta restrito ao contexto familiar
F920 Distúrbio depressivo de conduta
F930 Transtorno ligado à angústia de separação
F940 Mutismo eletivo
F980 Enurese de origem não-orgânica
G800 Paralisia cerebral quadriplágica espástica
G801 Paralisia cerebral diplégica espástica
G802 Paralisia cerebral hemiplégica espástica
G803 Paralisia cerebral discinética
G804 Paralisia cerebral atáxica
G808 Outras formas de paralisia cerebral
G809 Paralisia cerebral não especificada
H540 Cegueira, ambos os olhos
H900 Perda de audição bilateral devida a transtorno de condução
H910 Perda de audição ototóxica"""


def normalize(txt: str) -> str:
    txt = txt.replace("\r\n", "\n").replace("\r", "\n")
    txt = re.sub(
        r"^(?:TABELA DE COMPATIBILIDADE[^\n]*\nFISIOTERAPIA\s*\n\s*\n)",
        "",
        txt,
        count=1,
        flags=re.M | re.I,
    )
    txt = re.sub(
        r"(?ms)^(CÓDIGO:\s*0302040021\s*\nDESCRIÇÃO:.+?\nCID\s*10\s*\n)(.+?)(?=^\s*CÓDIGO:\s*\d)",
        r"\1IGUAL_ANTERIOR\n\n",
        txt,
        count=1,
    )
    if MALFORMED_TAIL in txt:
        txt = txt.replace(MALFORMED_TAIL, FIXED_TAIL, 1)
    return txt.strip() + "\n"


def main() -> None:
    if not RAW.is_file():
        raise SystemExit(f"Arquivo ausente: {RAW} (rode o extrator ou salve _raw_compat_extract)")
    txt = normalize(RAW.read_text(encoding="utf-8"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    banner = (
        "# Gerado/normalizado por scripts/normalize_extracted_compat.py + "
        "scripts/compat_tabela_txt_to_json.py\n\n"
    )
    OUT.write_text(banner + txt, encoding="utf-8")
    print(f"Gerado {OUT} ({len(txt)} caracteres)")


if __name__ == "__main__":
    main()
