# -*- coding: utf-8 -*-
"""
Converte recorte texto da 'Tabela de compatibilidade de código de procedimento com CID'
(no formato CODIGO / DESCRICAO / CID 10 / linhas CID) para data/cid_procedimento_compat.json.

Marcador opcional: após "CID 10", uma linha apenas com **IGUAL_ANTERIOR** copia a lista de CIDs
do bloco de procedimento anterior (útil quando 0302040021 repete a lista de 0302040013).

  python scripts/compat_tabela_txt_to_json.py data/import/tabela_compat_fisio.txt \\
    -o data/cid_procedimento_compat.json
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


def strip_accents_for_key(s: str) -> str:
    # Opcional normalizacao brasileira de CID omitida; manter formato da tabela
    return s.strip().upper()


def norm_cid_key(raw: str) -> str:
    s = strip_accents_for_key(raw)
    s = s.replace(",", ".")
    s = re.sub(r"\s+", "", s)
    return s


def split_blocks(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    starts = list(re.finditer(r"(?mi)^\s*CÓDIGO:\s*\d+", text))
    if not starts:
        starts = list(re.finditer(r"(?mi)^\s*CODIGO:\s*\d+", text))
    blocks = []
    for i, m in enumerate(starts):
        lo = m.start()
        hi = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        blocks.append(text[lo:hi].strip())
    return blocks


def extract_proc_meta(block: str) -> tuple[str, str]:
    mc = re.search(r"(?mi)CÓDIGO:\s*(\d+)", block) or re.search(
        r"(?mi)CODIGO:\s*(\d+)", block
    )
    if not mc:
        raise ValueError("Bloco sem CÓDIGO")
    codigo = mc.group(1).strip()
    after_cod = block[mc.end() :]

    m_c10 = re.search(r"(?mi)\bCID\s*10\b", after_cod)
    if not m_c10:
        raise ValueError("Bloco sem marca CID 10")
    antes_c10 = after_cod[: m_c10.start()]

    md = re.search(r"(?si)DESCRI[ÇC][ÃA]O:\s*", antes_c10)
    if not md:
        raise ValueError("Bloco sem DESCRIÇÃO")
    descricao = " ".join(antes_c10[md.end() :].strip().split())
    return codigo, descricao


def first_cid_tokens(line_stripped: str) -> tuple[str | None, str | None]:
    """Identifica CID (formato TUSS texto BR). Devolve token normalizado e resto textual na linha."""
    ln = line_stripped.strip()
    if not ln:
        return None, None
    md = re.match(
        r"^([A-TV-Z])(\d{2}\.\d+(?:\.\d+)?)(?:\s+(.*))?$",
        ln,
        re.I,
    )
    if md:
        tok = md.group(1).upper() + md.group(2).upper().replace(",", ".")
        return norm_cid_key(tok), (md.group(3) or "").strip()
    mz = re.match(r"^([A-TV-Z])(\d{3,})(?:\s+(.*))?$", ln, re.I)
    if mz:
        return norm_cid_key(mz.group(1).upper() + mz.group(2)), (mz.group(3) or "").strip()
    m2 = re.match(r"^([A-TV-Z])(\d{2})(?:\s+(.*))?$", ln, re.I)
    if not m2:
        return None, None
    return norm_cid_key(m2.group(1).upper() + m2.group(2)), (m2.group(3) or "").strip()


def line_starts_new_cid(ln_stripped: str) -> bool:
    return first_cid_tokens(ln_stripped)[0] is not None


def cid_lookup_aliases(primary_key: str) -> list[str]:
    """Aceita entrada com ou sem ponto (ex.: J322 ou J32.2)."""
    keys = [norm_cid_key(primary_key)]
    m = re.fullmatch(r"([A-TV-Z])(\d{2})\.(.+)", primary_key, re.I)
    if m:
        L, d2, rest = m.group(1).upper(), m.group(2), re.sub(r"[^\d]", "", m.group(3))
        keys.append(norm_cid_key(L + d2 + rest))
        return list(dict.fromkeys(keys))
    m2 = re.fullmatch(r"([A-TV-Z])(\d{2})(\d+)", primary_key, re.I)
    if m2:
        L, d2, rest = m2.group(1).upper(), m2.group(2), m2.group(3)
        keys.append(norm_cid_key(L + d2 + "." + rest))
    return list(dict.fromkeys(keys))


def is_igual_anterior_line(line: str) -> bool:
    """Primeira linha de conteúdo após 'CID 10' pode ser IGUAL_ANTERIOR."""
    s = line.strip()
    if not s:
        return False
    compact = re.sub(r"[\s_\-]+", "", s, flags=re.UNICODE).upper()
    if compact == "IGUALANTERIOR":
        return True
    return bool(re.match(r"(?is)^\s*IGUAL\s*[-_]?\s*ANTERIOR\b", s))


def iter_cids_after_marker(block: str, igual_fn) -> tuple[list[tuple[str, str]], bool]:
    """
    igual_fn: lista (cid, texto_diag) do bloco anterior quando este bloco marca IGUAL_ANTERIOR.
    """
    ix = block.upper().find("CID 10")
    if ix < 0:
        return [], False
    cid_part = block[ix + len("CID 10") :].strip()

    for first in cid_part.split("\n"):
        if not first.strip():
            continue
        if is_igual_anterior_line(first):
            inherit = igual_fn()
            return (list(inherit) if inherit else []), True
        break

    lines = cid_part.split("\n")

    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        tok, rest = first_cid_tokens(line)
        if not tok:
            i += 1
            continue
        if rest:
            pairs.append((tok, rest))
            i += 1
            continue
        i += 1
        extra: list[str] = []
        while i < len(lines):
            ln = lines[i].strip()
            if not ln:
                i += 1
                continue
            if line_starts_new_cid(ln):
                break
            extra.append(ln)
            i += 1
        pairs.append((tok, " ".join(extra)))

    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for cid_k, dx in pairs:
        if cid_k in seen:
            continue
        seen.add(cid_k)
        out.append((cid_k, dx.strip()))
    return out, False


def build_por_cid(blocks: list[str]) -> dict[str, list[dict]]:
    agg: dict[str, dict[tuple[str, str], dict]] = defaultdict(dict)
    last_pairs: list[tuple[str, str]] = []

    def inherit_last():
        return last_pairs

    for b in blocks:
        try:
            codigo_proc, descr_proc = extract_proc_meta(b)
        except ValueError:
            continue
        pairs, inherited = iter_cids_after_marker(b, inherit_last)
        if inherited and not pairs:
            continue
        if not inherited:
            last_pairs = list(pairs)
        for cid_k, texto_cid in pairs:
            for nk in cid_lookup_aliases(cid_k):
                if texto_cid:
                    full_desc = f"{descr_proc} | {texto_cid}"
                else:
                    full_desc = descr_proc
                if len(full_desc) > 950:
                    full_desc = full_desc[:947] + "..."
                key = (codigo_proc, full_desc[:200])
                agg[nk][key] = {"codigo": codigo_proc, "descricao": full_desc}
    return {k: list(v.values()) for k, v in agg.items()}


def merge_por_cid(
    a: dict[str, list[dict]], b: dict[str, list[dict]]
) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for src in (a, b):
        for cid, items in src.items():
            nk = norm_cid_key(cid)
            out[nk].extend(items)
    # dedupe (codigo, descricao truncated)
    final: dict[str, list[dict]] = {}
    for cid, items in out.items():
        seen = set()
        lst = []
        for it in items:
            tup = (it["codigo"], (it.get("descricao") or "")[:260])
            if tup in seen:
                continue
            seen.add(tup)
            lst.append({"codigo": it["codigo"], "descricao": it["descricao"]})
        final[cid] = lst
    return final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_txt", type=Path)
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data/cid_procedimento_compat.json"),
    )
    ap.add_argument(
        "--merge",
        action="store_true",
        help="Une porCid sobre JSON já existente no -o.",
    )
    args = ap.parse_args()
    txt = args.input_txt.read_text(encoding="utf-8")

    blocks = split_blocks(txt)
    por_new = build_por_cid(blocks)

    old_instr = ""
    merged = dict(por_new)
    if args.merge and args.output.is_file():
        try:
            old = json.loads(args.output.read_text(encoding="utf-8"))
            old_instr = old.get("_instrucoes", "")
            merged = merge_por_cid(old.get("porCid") or {}, por_new)
        except json.JSONDecodeError:
            pass

    doc = {
        "porCid": merged,
        "_instrucoes": old_instr
        or "Gerado por scripts/compat_tabela_txt_to_json.py a partir da tabela de fisioterapia (COMPATIBILIDADE CID x CODIGO).",
        "_fonte": str(args.input_txt.resolve()),
        "_procedimentos_blocos": len(blocks),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    n_cid = len(merged)
    n_lin = sum(len(v) for v in merged.values())
    print(f"Blocos CODIGO: {len(blocks)} | CIDs únicos: {n_cid} | vínculos codigo+Cid: {n_lin} -> {args.output}")


if __name__ == "__main__":
    main()
