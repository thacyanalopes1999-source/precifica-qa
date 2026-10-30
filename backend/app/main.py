"""Precifica QA - motor local MVP; não executa exclusões nem garante equivalência semântica.
Limites de entrada: configuraveis; 500 mil requer infraestrutura e testes de carga.
"""
import io
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import pandas as pd
from defusedxml import ElementTree as SafeET
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from rapidfuzz import fuzz

app = FastAPI(title="Precifica QA", version="10.1.0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.100.22:3000", "http://localhost:3001", "http://127.0.0.1:3001", "http://192.168.100.22:3001"],
    allow_methods=["GET", "POST"], allow_headers=["*"],
)

MAX_BYTES = 200 * 1024 * 1024
MAX_ROWS = 500_000
MAX_CANDIDATES = 35
# Ajuste fino: aplicar apenas depois de validar familia, EAN e atributos.
MATCH_MIN_MESMA_FAMILIA = 78
MATCH_MIN_TEXTO_SEM_CATEGORIA = 94
REVISAR_MIN_TEXTO_SEM_CATEGORIA = 55
SUPPORTED = {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", ".json", ".jsonl", ".ndjson", ".xml", ".parquet"}
COLORS = {"coral","amarelo","laranja","roxo","branca","preta","vermelha","amarela","prateada","prateado","dourada","branco", "preto", "azul", "verde", "vermelho", "amarelo", "cinza", "bege", "rosa", "marrom", "dourado", "prata"}
STOPWORDS = {"de", "da", "do", "das", "dos", "com", "sem", "para", "em", "e", "o", "a", "un", "und", "unid", "produto"}
SYNONYMS = {"sanitario": "sanitario", "vaso": "vaso", "wc": "vaso", "br": "branco", "pto": "preto", "inox": "inox", "centimetros": "cm", "centimetro": "cm", "milimetros": "mm", "milimetro": "mm", "litros": "l", "litro": "l"}


# Regras sobre o TEXTO NORMALIZADO (sem stopwords como "de", "para").
# Mais específicas primeiro. Termos genéricos são fallback e nunca sobrescrevem
# um tipo específico. Sem categoria comprovada, conserva a revisão por score.
PRODUCT_TYPES = {
    "lubrificante_moto": [r"\b(?:oleo|lubrificante)\b.*\b(?:lubrax|moto|motor|4t|20w50|10w40|mineral|sintetico)\b", r"\blubrax\b"],
    "filtro_agua": [r"\bfiltro\s+(?:barro|agua|sao joao)\b", r"\bpurificador\s+agua\b"],
    "filtro_oleo": [r"\bfiltro\s+(?:oleo|lubrificante)\b"],
    "cafeteira": [r"\bcafeteira\b", r"\bmaquina\s+cafe\b"],
    "perfume": [r"\bperfume\b", r"\beau\s+(?:parfum|toilette)\b", r"\bpaco\s+rabanne\b"],
    "berco": [r"\bberco\b",r"\bminicama\b"],
    "quarto_modulado": [r"\bquarto\s+(?:modulado|completo|bebe)\b"],
    "home_tv": [r"\bhome\s+(?:ripado|supremo|painel)\b"],
    "bingo": [r"\bbingo\b",r"\bglobo\s+(?:metalico|metal)\b.*\bcartelas\b",r"\bvispora\b"],
    "lava_roupas": [r"\b(?:maquina|lavadora)\s+(?:lavar|roupas)\b",r"\blava\s+seca\b",r"\btanquinho\b"],
    "cloro_piscina": [r"\bcloro\b",r"\bgenclor\b"],
    "cadeira_auto": [r"\bcadeira\s+(?:auto|carro)\b",r"\bisofix\b"],
    "pillow_top": [r"\bpillow\s+top\b"],
    "motocultivador": [r"\b(?:motocultivador|tratorito)\b"],
    "sala_jantar": [r"\b(?:conjunto|jogo)\s+sala\s+jantar\b",r"\bmesa\s+4\s+cadeiras\b"],
    "potes": [r"\bpotes?\s+(?:mantimentos|plastico|cozinha)\b"],
    "panela": [r"\b(?:panela|panelas|cacarola|cacarolas)\b"],
    "tacas": [r"\btacas?\b"],
    "suplemento": [r"\b(?:centrum|multivitaminico|vitaminas)\b"],
    "penteadeira": [r"\bpenteadeira\b"],
    "tanque_lavanderia": [r"\btanque\b.*\b(?:deca|tq02|lavanderia)\b"],
    "balcao_cooktop": [r"\bbalcao\b.*\bcooktop\b"],
    "depurador": [r"\b(?:depurador|coifa|exaustor)\b"],
    "balanca": [r"\bbalanca\b"],
    "microfone": [r"\bmicrofon(?:e|es)\b"],
    "fone_ouvido": [r"\bfone\s+ouvido\b",r"\b(?:headphone|headset)\b"],
    "capacete": [r"\bcapacete\b"],
    "trampolim": [r"\b(?:cama\s+elastica|trampolim|pula\s+pula)\b"],
    "tenis": [r"\btenis\b"],
    "aquecedor": [r"\baquecedor\b"],
    "colchao": [r"\b(?:colchao|cama\s+box)\b"],
    "guarda_roupa": [r"\b(?:guarda\s+roupa|roupeiro)\b"],
    "cabeceira": [r"\bcabeceira\b"],
    "boleira": [r"\b(?:boleira|porta\s+bolo|prato\s+bolo)\b"],
    "frigideira": [r"\b(?:frigideira|wok)\b"],
    "fritadeira": [r"\b(?:fritadeira|airfryer|air\s+fryer|oven\s+fryer)\b"],
    "ventilador": [r"\b(?:ventilador|climatizador)\b"],
    "monitor": [r"\bmonitor\b"],
    "ducha": [r"\b(?:ducha|chuveiro)\b"],
    "triciclo": [r"\b(?:triciclo|motoca)\b"],
    "relogio": [r"\b(?:relogio|smartwatch)\b"],
    "pneu": [r"\bpneus?\b"],
    "armario": [r"\barmario\b"],
    "sofa": [r"\bsofa\b"],
    "bomba_agua": [r"\b(?:motobomba|bomba\s+periferica|bomba\s+piscina|bomba\s+jacuzzi)\b"],
    "escada": [r"\bescada\b"],
    "andador": [r"\bandador\b"],
    "bicicleta": [r"\b(?:bicicleta|bicicletinha|bike\s+spinning|bike\s+ergometrica|bike\s+infantil)\b"],
    "geladeira": [r"\b(?:geladeira|refrigerador)\b"],
    "microondas": [r"\bmicroondas\b"],
    "televisao": [r"\b(?:televisao|smart\s+tv|tv\s+(?:led|qled|oled|4k|\d+))\b"],
    "tablet": [r"\b(?:ipad|tablet)\b"],
    "celular": [r"\b(?:smartphone|celular|iphone)\b"],
    "notebook": [r"\b(?:notebook|laptop)\b"],
    "brinquedo": [r"\b(?:brinquedo|boneca)\b"],
}

# Catálogo adicional de famílias COM TERMOS INEQUÍVOCOS.
# Expandir apenas quando a descrição especifica a família: textos ambíguos
# continuam para revisão manual, nunca viram DIFERENTE só por score baixo.
_EXTRA_PRODUCT_TYPES = {
    "protetor_solar": [r"\b(?:protetor\s+solar|filtro\s+solar|protetor\s+facial(?:\s+\w+){0,6}\s+fps)\b"],
    "bebedouro": [r"\bbebedouros?\b"],
    "edredom": [r"\bedredons?\b", r"\bedredom\b"],
    "tapete": [r"\btapetes?\b"],
    "bota": [r"\b(?:bota|botas|coturno|coturnos)\b"],
    "chuteira": [r"\bchuteiras?\b"],
    "jaqueta": [r"\bjaquetas?\b"],
    "roupa_camiseta": [r"\b(?:camiseta|camisetas|t\s?shirt)\b"],
    "roupa_camisa": [r"\b(?:camisa|camisas)\b"],
    "amortecedor": [r"\bamortecedores?\b"],
    "farol_veiculo": [r"\b(?:farol|farois)\b.*\b(?:carro|montana|corsa|dianteiro|traseiro|automotivo)\b"],
    "central_multimidia": [r"\b(?:central\s+multimidia|multimidia\s+automotiva)\b"],
    "cumeeira": [r"\bcumeeiras?\b"],
    "churrasqueira": [r"\bchurrasqueiras?\b"],
    "revistas": [r"\brevistas?\b.*\b(?:artesanato|bordado|croche|colecao)\b"],
    "luminaria": [r"\b(?:luminaria|abajur)\b"],
    "livro": [r"\blivros?\b"],
    "aspirador_po": [r"\baspirador(?:\s+de)?\s+po\b"],
    "cafeteira_capsulas": [r"\bcafeteira\s+capsulas?\b"],
    "smartwatch": [r"\bsmartwatch\b"],
    "ar_condicionado": [r"\bar\s+condicionado\b"],
    "impressora": [r"\bimpressoras?\b"],
    "cadeira_escritorio": [r"\bcadeira\s+(?:gamer|escritorio|office)\b"],
    "fogao": [r"\b(?:fogao|cooktop)\b"],
    "liquidificador": [r"\bliquidificador\b"],
    "sabonete": [r"\bsabonetes?\b"],
    "shampoo": [r"\b(?:shampoo|xampu)\b"],
    "racao": [r"\bracao\b"],
    "mochila": [r"\bmochilas?\b"],
    "bolsa": [r"\bbolsas?\b"],
}
PRODUCT_TYPES.update(_EXTRA_PRODUCT_TYPES)

_TYPE_REGEX = {name: [re.compile(p) for p in patterns] for name, patterns in PRODUCT_TYPES.items()}
_GENERIC_TYPES = {"brinquedo", "armario"}

# Regra: produto principal tem precedencia sobre funcionalidades e acessorios.
# Exemplos: bicicleta com monitor = bicicleta; armario tipo guarda-roupa = mobiliario.
_TYPE_ALIASES = {"guarda_roupa": "armario", "armario": "armario",  "smartwatch": "relogio", "cafeteira_capsulas": "cafeteira", "roupa_camiseta": "vestuario_superior", "roupa_camisa": "vestuario_superior"}
_PRODUCT_PRIORITY = (
    "lubrificante_moto", "filtro_agua", "filtro_oleo", "cafeteira", "perfume", "berco",
    "quarto_modulado", "home_tv", "bingo", "lava_roupas", "cloro_piscina",
    "cadeira_auto", "pillow_top", "motocultivador", "sala_jantar", "potes",
    "panela", "tacas", "suplemento", "penteadeira", "tanque_lavanderia",
    "balcao_cooktop", "depurador", "balanca", "microfone", "fone_ouvido",
    "capacete", "trampolim", "tenis", "aquecedor", "colchao", "guarda_roupa",
    "cabeceira", "boleira", "frigideira", "fritadeira", "ventilador", "ducha",
    "triciclo", "relogio", "pneu", "armario", "sofa", "bomba_agua",
    "escada", "andador", "bicicleta", "geladeira", "microondas", "televisao",
    "tablet", "celular", "notebook", "monitor", "brinquedo",
)

# As famílias explícitas novas são consultadas antes das genéricas.
_PRODUCT_PRIORITY = tuple(_EXTRA_PRODUCT_TYPES) + _PRODUCT_PRIORITY


# v9.2: familias reconheciveis sem ambiguidade. Nao equiparar categorias
# so por compartilharem palavras vagas como "cama", "ar" ou "inox".
_MORE_PRODUCT_TYPES = {
    "compressor_ar": [r"\bcompressor\s+(?:de\s+)?ar\b", r"\bcompressor\s+(?:direto|mega|portatil|industrial)\b"],
    "cama_pet": [r"\b(?:caminha|cama)\s+(?:pet|cachorro|gato)\b", r"\bcama\s+caminha\s+pet\b", r"\bcaminha\s+pet\b"],
    "torneira": [r"\btorneiras?\b"],
    "rack_tv": [r"\brack\s*(?:tv|para\s+tv|televisao)\b", r"\brack\b.*\b(?:sala|home|estante)\b"],
    "escrivaninha": [r"\bescrivaninha\b"],
    "roupa_conjunto": [r"\b(?:trijunto|conjunto\s+infantil|conjunto\s+de\s+roupa)\b"],
    "roupa_regata": [r"\bregatas?\b"],
    "roupa_calca": [r"\bcalcas?\b"],
    "roupa_bermuda": [r"\b(?:bermudas?|shorts?)\b"],
    "roupa_chinelo": [r"\bchinelos?\b"],
    "roupa_sapatenis": [r"\bsapatenis\b"],
    "roupa_sapato": [r"\bsapatos?\b"],
    "vestido": [r"\bvestidos?\b"],
    "camiseta": [r"\b(?:camiseta|camisetas|tshirt)\b"],
    "cortina": [r"\b(?:cortina|blackout)\b"],
    "camera_foto": [r"\b(?:camera\s+(?:digital|canon|kodak|fotografica|mirrorless|compacta)|camera\s+eos|powershot|pixpro)\b"],
    "lente_camera": [r"\blente\s+(?:canon|sony|nikon|rf|fotografica)\b"],
    "forno": [r"\bfornos?\b"],
    "freezer": [r"\bfreezers?\b"],
    "furadeira": [r"\bfuradeiras?\b"],
    "lavadora_alta_pressao": [r"\blavadora\s+de\s+alta\s+pressao\b"],
    "batedeira": [r"\bbatedeiras?\b"],
    "cabo_eletrico": [r"\b(?:cabo\s+(?:flexsil|flexivel|eletrico|de\s+cobre)|fio\s+de\s+cobre)\b"],
    "bateria_pilha": [r"\b(?:bateria\s+9v|pilhas?\s+(?:duracell|alcalinas?|aa|aaa))\b"],
    "jogo_tabuleiro": [r"\b(?:jogo\s+de\s+tabuleiro|cara\s+a\s+cara)\b"],
    "creme_pele": [r"\b(?:creme\s+(?:clareador|corporal|facial)|bioderma\s+pigmentbio)\b"],
    "gel_cosmetico": [r"\b(?:gel\s+intimo|intimate\s+repair)\b"],
    "cosmetico_capilar": [r"\b(?:spray\s+de\s+(?:volume|cabelo)|shampoo|condicionador|hair\s+body)\b"],
    "termogenico": [r"\b(?:morosil|termogenico|picolinato\s+de\s+cromo)\b"],
    "ferro_passar": [r"\bferro\s+(?:de\s+)?passar\b"],
    "escova_secadora": [r"\bescova\s+(?:secadora|modeladora)\b"],
    "secador_cabelo": [r"\bsecador\s+(?:de\s+)?cabelo\b", r"\bshark\s+flexstyle\b"],
    "balcao_pia": [r"\bbalcao\s+de\s+cozinha\s+com\s+pia\b", r"\bbalcao\b.*\bpia\b"],
    "valvula_descarga": [r"\b(?:acabamento\s+para\s+valvula|valvula\s+de\s+descarga)\b"],
    "almofada": [r"\balmofadas?\b", r"\bfutton\b"],
    "cadeira_refeicao_bebe": [r"\bcadeira\s+(?:de\s+)?refeicao\b"],
    "churrasqueira_eletrica": [r"\bchurrasqueira\s+eletrica\b"],
    "luminaria": [r"\b(?:luminaria|abajur)\b"],
    "sanduicheira": [r"\bsanduicheiras?\b"],
    "liquidificador": [r"\bliquidificadores?\b"],
    "roupa_jaqueta": [r"\bjaquetas?\b"],
    "ducha_higienica": [r"\bducha\s+higienica\b"],
}
# v10: familias antes ausentes que confundiam produto com acessorio/funcionalidade.
_V10_PRODUCT_TYPES = {
    "balcao_movel": [r"\bbalcao\b"],
    "beliche": [r"\bbeliches?\b"],
    "multiprocessador": [r"\bmultiprocessador\b"],
    "mala": [r"\bmalas?\b.*\b(?:viagem|bordo|polipropileno|rodas|cruzeiro|cartagena)\b", r"\bmala\s+(?:media|grande|pequena)\b"],
    "creme_dental": [r"\bcreme\s+dental\b", r"\bpasta\s+de\s+dente\b"],
    "guitarra": [r"\bguitarras?\b"],
    "quadriciclo": [r"\bquadriciclos?\b"],
    "cuba_banheiro": [r"\bcuba\s+(?:pia|de|para|apoio)\b"],
    "rack_tv": [r"\brack\b.*\b(?:tv|sala|home|estante)\b"],
    "secador_cabelo": [r"\bsecador\b.*\b(?:cabelo|shark|flexstyle)\b"],
}
PRODUCT_TYPES.update(_V10_PRODUCT_TYPES)
PRODUCT_TYPES.update(_MORE_PRODUCT_TYPES)
_TYPE_REGEX.update({name: [re.compile(p) for p in patterns] for name, patterns in _MORE_PRODUCT_TYPES.items()})
_TYPE_REGEX.update({name: [re.compile(p) for p in patterns] for name, patterns in _V10_PRODUCT_TYPES.items()})
# Estas familias precedem os nomes antigos. Em titulos mistos a prioridade
# pelo inicio (na funcao product_type) continua valendo.
_PRODUCT_PRIORITY = tuple(_V10_PRODUCT_TYPES) + tuple(_MORE_PRODUCT_TYPES) + _PRODUCT_PRIORITY
_TYPE_ALIASES.update({"camiseta": "vestuario_superior", "roupa_jaqueta": "jaqueta", "roupa_sapatenis": "sapato", "roupa_sapato": "sapato"})

@lru_cache(maxsize=100_000)
def product_type(raw: str) -> str | None:
    normalized = clean_text(split_description(raw)[0])
    if not normalized:
        return None
    matches = [name for name in _PRODUCT_PRIORITY if any(pattern.search(normalized) for pattern in _TYPE_REGEX[name])]
    if not matches:
        return None
    # Evita interpretar um atributo/acessorio como tipo principal.
    if "bicicleta" in matches:
        return "bicicleta"
    if "quarto_modulado" in matches:
        return "quarto_modulado"
    if "sofa" in matches and "colchao" in matches:
        return "sofa"
    if "monitor" in matches and len(matches) > 1:
        matches.remove("monitor")
    if "andador" in matches and "brinquedo" in matches:
        matches.remove("brinquedo")
    if "armario" in matches and "guarda_roupa" in matches:
        matches.remove("armario")
    # Inicio do nome manda; uma palavra sobre acessorios nas especificacoes
    # nao pode sobrepor o produto principal (ex.: bebedouro com 3 torneiras).
    for name in matches:
        if any(p.match(normalized) for p in _TYPE_REGEX[name]):
            return _TYPE_ALIASES.get(name, name)
    first_words = " ".join(normalized.split()[:3])
    for name in matches:
        if any(p.search(first_words) for p in _TYPE_REGEX[name]):
            return _TYPE_ALIASES.get(name, name)
    if len(matches) == 1:
        return _TYPE_ALIASES.get(matches[0], matches[0])
    return None

def _valid_gtin(value: str) -> bool:
    if len(value) not in (8, 12, 13, 14) or not value.isdigit() or set(value)=={'0'}:
        return False
    checksum = sum(int(d)*(3 if i%2==0 else 1) for i,d in enumerate(value[-2::-1]))
    return (10-checksum%10)%10 == int(value[-1])


def ean_value(row, columns: tuple[str, ...]) -> str | None:
    for key in columns:
        if key not in row:
            continue
        value = str(row[key]).strip()
        if not value or value.lower() in {"nan", "none"}:
            continue
        digits = re.sub(r"\D", "", value)
        if _valid_gtin(digits):
            return digits
    return None

def ean_state(a_row, b_row) -> str:
    left = ean_value(a_row, ("Código de Barras", "Codigo de Barras", "EAN", "GTIN"))
    right = ean_value(b_row, ("Código de Barras Monitorado", "Codigo de Barras Monitorado", "EAN", "GTIN"))
    if not left or not right:
        return "AUSENTE"
    return "IGUAL" if left == right else "DIFERENTE"

def ean_check(a_row, b_row) -> str | None:
    state = ean_state(a_row, b_row)
    if state == "IGUAL":
        return "EAN coincidente"
    if state == "DIFERENTE":
        return "EAN divergente (verificar cadastro/variante)"
    return None

def category_check(a: str, b: str, ean_conflict: bool = False) -> tuple[bool, str]:
    ta, tb = product_type(a), product_type(b)
    related = {frozenset({"quarto_modulado", "armario"}), frozenset({"quarto_modulado", "cabeceira"}), frozenset({"sofa", "colchao"})}
    if ta and tb and ta != tb and frozenset({ta, tb}) in related:
        return False, f"Categorias relacionadas: {ta.replace('_', ' ')} x {tb.replace('_', ' ')}; confirmar composição"
    if ta and tb and ta != tb:
        return True, f"INCOMPATIBILIDADE DE CATEGORIA: {ta.replace('_', ' ')} x {tb.replace('_', ' ')}"
    if ta and tb:
        return False, f"Categoria reconhecida em ambos: {ta.replace('_', ' ')}"
    if tb == "lubrificante_moto" and not ta and ean_conflict:
        normalized_a = clean_text(split_description(a)[0])
        if len(normalized_a.split()) >= 3 and not re.search(r"\b(?:oleo|lubrax|lubrificante|lubrificacao)\b", normalized_a):
            return True, "INCOMPATIBILIDADE: anúncio B é óleo lubrificante, produto A não descreve lubrificante e EANs divergem"
    return False, "Categoria não conclusiva; classificação preservada por similaridade"

# Padrao de atributo explicito. A ausencia num dos lados NAO constitui conflito.
def technical_conflicts(raw_a: str, raw_b: str) -> list[str]:
    a = clean_text(split_description(raw_a)[0]); b = clean_text(split_description(raw_b)[0])
    found = []
    # Voltagens declaradas de forma inequívoca, incluindo 110/127 e 220.
    def voltages(t):
        vals = set(re.findall(r"\b(110|127|220|230|240)\s*v?\b", t))
        return {"127" if x == "110" else x for x in vals}
    va, vb = voltages(a), voltages(b)
    if va and vb and va.isdisjoint(vb) and not ("bivolt" in a or "bivolt" in b):
        found.append("voltagem diferente")
    ca, cb = attrs(a)[0], attrs(b)[0]
    if ca and cb and ca.isdisjoint(cb):
        found.append("cor diferente")
    # Modelos confiáveis são alfanuméricos ou explicitamente identificados como modelo.
    def model(t):
        vals = set(re.findall(r"\b(?=[a-z0-9/-]*[a-z])(?=[a-z0-9/-]*\d)[a-z][a-z0-9/-]{3,}\b", t))
        return {x.replace("/", "").replace("-", "") for x in vals if x not in {"20w50", "10w40"} and not re.fullmatch(r"\d+(?:kg|cm|mm|ml|gb|tb|hz|mp)", x)}
    ma, mb = model(a), model(b)
    if ma and mb and ma.isdisjoint(mb):
        # Nao presumir que codigos arbitrarios nas descricoes sejam modelos:
        # apenas alerta, nunca rejeicao automatica por esta evidencia sozinha.
        found.append("codigos alfanumericos diferentes (conferir modelo)")
    return found

# Palavras de marketing, medidas/cores e termos genericos NAO sao indicios
# de identidade de produto. A intersecao so conta identificadores distintivos.
_NON_DISTINCTIVE = {
    "produto", "original", "novo", "nova", "grande", "medio", "pequeno", "extra",
    "tipo", "modelo", "linha", "premium", "mega", "super", "completo", "kit",
    "unidades", "unidade", "und", "un", "multifuncional", "profissional", "industrial",
    "direto", "portatil", "design", "moderno", "moderna", "facil", "pratico",
    "alta", "baixo", "baixo", "baixo", "uso", "simples", "leve", "para", "de", "por",
    "color", "cor", "preto", "preta", "branco", "branca", "cinza", "azul", "inox",
    "vermelho", "vermelha", "verde", "rosa", "marrom", "prata", "dourado",
    "cm", "mm", "kg", "gb", "tb", "ml", "litro", "litros", "w", "v", "l", "g",
    "1", "2", "3", "4", "5", "6", "10", "100", "220", "127", "110",
    "x", "e", "a", "o", "na", "no", "em", "da", "do", "das", "dos",
    "altura", "largura", "comprimento", "dimensoes", "cmj",  # cmj sozinho pode ser modelo, 210 conta apenas num contexto mais forte
}

# Pares de familias que podem ser kit/composicao ou anuncios mistos.
_RELATED_FAMILIES = {
    frozenset(("quarto_modulado", "armario")),
    frozenset(("quarto_modulado", "cabeceira")),
    frozenset(("sofa", "colchao")),
    frozenset(("pillow_top", "colchao")),
    frozenset(("rack_tv", "escrivaninha")),
    frozenset(("rack_tv", "home_tv")),
    frozenset(("roupa_sapatenis", "tenis")),
    frozenset(("sapato", "tenis")),
}

# Restrito a marcas de produtos inequivocas, para nao classificar nomes
# genericos como marca. Mencoes "para X" (compatibilidade) nao valem.
_BRANDS = {
    "lubrax", "castrol", "motul", "petronas", "shell", "mobil", "valvoline", "ipiranga",
    "adidas", "nike", "fila", "olympikus", "asics", "mizuno", "modare", "dakota",
    "samsung", "xiaomi", "motorola", "apple", "lenovo", "acer", "dell", "asus",
    "canon", "nikon", "kodak", "sony", "fujifilm",
    "britania", "mondial", "electrolux", "brastemp", "philco", "midea", "walita",
    "natura", "boticario", "armani", "ysl", "versace", "burberry",
    "anasol", "boucheron", "darrow", "curaprox", "consul", "bibi", "bandeirante",
    "ferrari", "celite", "docol", "fischer", "cofap", "mor", "benson",
    "cruzeiro", "imbera", "frisbel", "adcos", "buddemeyer", "invicta",
    "puma", "kolosh", "lorenzetti", "deca", "probel", "sankonfort",
    "philips", "deca", "bioderma", "ortobom", "michelin", "pirelli", "continental", "goodyear", "kelly",
}

@lru_cache(maxsize=150_000)
def _explicit_brand(raw: str) -> str | None:
    text = clean_text(split_description(raw)[0]); words=text.split()
    if "kelly by goodyear" in str(raw).lower():
        return "kelly"
    found=[]
    for i, token in enumerate(words[:12]):
        if token in _BRANDS and (i == 0 or words[i-1] not in {"para", "compativel"}):
            found.append(token)
    return found[0] if len(set(found)) == 1 else None

@lru_cache(maxsize=150_000)
def _distinctive_tokens(raw: str) -> frozenset[str]:
    normalized = clean_text(split_description(raw)[0])
    return frozenset(t for t in normalized.split()
                     if (len(t) >= 3 or (t.isdigit() and len(t) >= 3))
                     and t not in _NON_DISTINCTIVE)

# ========== V10: ANALISE DE IDENTIDADE E VARIANTES ===========
# 15% serve para ENCONTRAR candidatos, nunca para aprovar a identidade.
MIN_SCORE_PARA_INSPECAO = 15.0

# Marcas que sao variantes escritas de modo diferente.
_BRAND_EQUIV = {"ysl": "yves_saint_laurent", "britania": "britania",
                "apple": "apple", "lubrax": "lubrax"}
_FAMILY_EQUIV = {"roupa_sapatenis": "sapato", "camiseta": "vestuario_superior",
                 "roupa_jaqueta": "jaqueta", "roupa_sapato": "sapato"}
_GENERIC_CATALOG = {"tenis", "sapato", "vestuario_superior", "bolsa", "brinquedo",
                    "mala", "roupa_conjunto", "livro", "perfume", "celular", "televisao"}
_RELEVANT_VARIANT_TYPES = {"pillow_top", "colchao", "cama_pet", "tapete", "cortina",
                           "tenis", "sapato", "bota", "chuteira", "mala"}
_VOLTS = re.compile(r"(?<![a-z0-9])(?:110|127|220|230|240)\s*(?:v|volts?|voltagem)\b", re.I)
_MODEL_CODE = re.compile(r"(?<![a-z0-9])(?=[a-z0-9-]{4,}\b)(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9]+(?:-[a-z0-9]+)*(?![a-z0-9])", re.I)
_PRODUCT_DIMENSIONS = re.compile(r"(?<!\d)(\d{2,3})\s*[x×*]\s*(\d{2,3})(?:\s*cm)?\b")
_STORAGE = re.compile(r"(?<!\d)(\d{1,4})\s*(gb|tb)\b")
_WEIGHTS = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b")
_SERIES = re.compile(r"\b(?:runfalcon|gel[- ]?nimbus|gel[- ]?cumulus|gel[- ]?venture|duramo)\s*(\d{1,2})(?!\d)",re.I)

# v10.1.0.1: atributos extraidos do nome comercial (nunca das dimensoes
# logisticas apos 'Dimensoes:'). Formatos equivalentes devem gerar o MESMO valor.
_TIRE_SPEC = re.compile(r"(?<!\d)(\d{3})\s*[-/]\s*(\d{2})\s*(?:z\s*)?r\s*(\d{2})(?!\d)", re.I)
_TIRE_LOAD = re.compile(r"(?<!\d)(\d{2,3})\s*([a-z])(?=\b|\s|$)", re.I)
_MODEL_COMPOUND = re.compile(r"(?<![a-z0-9])([a-z0-9]{2,}(?:[-/][a-z0-9]{1,})+)(?![a-z0-9])", re.I)
_MODEL_SEPARATED = re.compile(r"\b(cmj|k|pfu|bmp|erg)\s+(\d{2,6}[a-z]{0,4})\b", re.I)
_COMMERCIAL_DIMENSIONS = re.compile(r"(?<![\d.,])(\d{2,4})\s*[x×*]\s*(\d{2,4})(?:\s*[x×*]\s*(\d{2,4}))?\s*(?:cm)?\b", re.I)
_ORDERLESS_SIZE_FAMILIES = {"colchao", "pillow_top", "tapete", "cama_pet"}
_AC_CAPACITY = re.compile(r"(?<![\da-z])(\d{1,5}(?:[.,]\d{3})?)\s*(?:btu(?:s|/h)?|btus)(?![a-z])", re.I)
_AC_30K = re.compile(r"(?<!\d)(\d{1,2})k\b(?=.{0,10}\b(?:frio|qf|quente|btu))", re.I)
_TIRE_HOMOLOGATION = re.compile(r"\b(?:k1|ks|mo|ao|rft|runflat)\b", re.I)


def _ac_capacity_and_cycle(t: str, family: str | None):
    if family != "ar_condicionado":
        return None, None
    match = _AC_CAPACITY.search(t)
    cap = int(re.sub(r"[.,]", "", match.group(1))) if match else None
    if not cap:
        alt = _AC_30K.search(t)
        cap = int(alt.group(1)) * 1000 if alt else None
    if cap is not None and not 5000 <= cap <= 60000:
        cap = None
    heat_cool = bool(re.search(r"\bquente\s*(?:e|/|-)\s*frio\b|\bqf\b|\bciclo\s+reverso\b", t))
    cool_only = bool(re.search(r"\b(?:so|somente)\s+frio\b", t) or
                     (re.search(r"\bfrio\b", t) and not re.search(r"\bquente\b", t)))
    mode = "QUENTE_FRIO" if heat_cool else "FRIO" if cool_only else None
    return cap, mode



def _canonical_product_dimensions(t: str, family: str | None) -> frozenset[str]:
    sizes = set()
    for match in _COMMERCIAL_DIMENSIONS.finditer(t):
        parts = [part for part in match.groups() if part is not None]
        # Em colchao/tapete o giro da medida nao muda o produto.
        if family in _ORDERLESS_SIZE_FAMILIES:
            parts.sort(key=int)
        sizes.add("x".join(parts))
    return frozenset(sizes)


def _canonical_models(t: str, family: str | None) -> frozenset[str]:
    # 215-60R17 e 215/60R17 sao medidas de pneus, nao codigos de modelo.
    model_text = _TIRE_SPEC.sub(" ", t) if family == "pneu" else t
    # Evita colar a voltagem no codigo de modelo quando vem sem espaco:
    # VIHT12KCH3S2S23-220V -> VIHT12KCH3S2S23 + 220V.
    model_text = re.sub(r"(?<=[a-z0-9])[-/](110|127|220|230|240)\s*(?:v|volts?)\b", r" \1v", model_text)

    compounds = set()
    for m in _MODEL_COMPOUND.finditer(model_text):
        val = re.sub(r"[^a-z0-9]", "", m.group(1).lower())
        # Medidas de pneus/embalagens e versoes de tensao nao sao modelos.
        if len(val) >= 4 and re.search(r"[a-z]", val) and val not in {"btuh", "bluetooth", "wifi"} and not re.fullmatch(r"\d+(?:cm|mm|kg|ml|gb|tb|v)", val):
            compounds.add(val)
    raw = {x.lower().replace("-", "") for x in _MODEL_CODE.findall(model_text)}
    result = set(compounds)
    for x in raw:
        if x in {"iphone", "galaxy", "fullhd", "4k", "wifi6", "btuh"} or re.search(r"\d+x\d+", x):
            continue
        if re.fullmatch(r"(?:fps\d+|\d+(?:v|w|kg|g|ml|l|gb|tb|cm|mm|mp)|\d+w\d+|\d+hz)",x):
            continue
        # Evita extrair metade de um codigo com / ou - e inventar conflito.
        if any(x != c and (x in c) for c in compounds):
            continue
        result.add(x)
    # K 621H -> K621H, CMJ 210 -> CMJ210.
    for m in _MODEL_SEPARATED.finditer(model_text):
        candidate = "".join(m.groups()).lower()
        if candidate not in {"fps90"} and (len(m.group(1)) >= 2 or len(m.group(2)) >= 4):
            result.add(candidate)
            result.discard(m.group(2).lower())
    # Evita modelos parciais quando versoes equivalentes ja foram encontradas.
    return frozenset(x for x in result if not any(x != y and x in y for y in result))


def _compact_commercial_title(raw: str) -> str:
    title = split_description(raw)[0]
    title = unicodedata.normalize("NFKD", title.casefold())
    title = "".join(ch for ch in title if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", title)


@lru_cache(maxsize=180_000)
def _features_v10(raw: str) -> dict:
    core = split_description(raw)[0]
    # Preserva os caracteres alfanumericos do modelo ANTES da tokenizacao.
    t = unicodedata.normalize("NFKD", core.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.replace("×", "x").replace("*", "x")
    clean = clean_text(core)
    family = product_type(raw)
    # 'Balcao para forno/microondas' e movel, nao forno ou micro-ondas.
    if re.match(r"^balcao\b", t):
        family = ("balcao_pia" if re.search(r"\bpia\b",t) else
                  "balcao_cooktop" if re.search(r"\bcooktop\b",t) else "balcao_movel")
    if re.match(r"^(?:misturador\s+monocomando|torneira\s+misturador)",t) and "cozinha" in t:
        family="torneira"
    if re.match(r"^(?:cuba\s+pia|cuba\s+de\s+apoio)",t):
        family = "cuba_banheiro"
    if re.match(r"^(?:creme\s+dental|pasta\s+de\s+dente)",t):
        family = "creme_dental"
    if family in _FAMILY_EQUIV:
        family = _FAMILY_EQUIV[family]
    # Extrai o codigo completo. A v10 anterior confundia pontuacao com
    # modelos diferentes: K621H x K 621H, 2115UBX-1F x 2115UBX/1F.
    models = _canonical_models(t, family)
    tire = None
    tire_rating = None
    tire_c = None
    tire_lt = None
    tire_homologation = None
    if family == "pneu":
        homologation = _TIRE_HOMOLOGATION.search(t)
        tire_homologation = homologation.group().lower() if homologation else None
        match = _TIRE_SPEC.search(t)
        if match:
            tire = tuple(int(v) for v in match.groups())
            tire_c = bool(re.match(r"c\b", t[match.end():]))
            tire_lt = bool(re.match(r"lt\b", t[match.end():]))
            after = t[match.end():match.end()+16]
            load = _TIRE_LOAD.search(after)
            if load and (65 <= int(load.group(1)) <= 125):
                tire_rating = (int(load.group(1)), load.group(2).upper())
    ac_capacity, ac_mode = _ac_capacity_and_cycle(t, family)
    formula = ("EDP" if re.search(r"\beau\s+de\s+parfum\b|\bedp\b", t) else
               "EDT" if re.search(r"\beau\s+de\s+toilette\b|\bedt\b", t) else None)
    volt = set()
    for m in _VOLTS.finditer(t):
        val = re.match(r"\d+",m.group()).group()
        volt.add("127" if val == "110" else val)
    volt = frozenset(volt)
    bivolt = bool(re.search(r"\bbivolt\b|\bdual\s+voltage\b",t))
    colors_raw=set(clean.split()) & COLORS
    _color_canon = {"branca":"branco", "preta":"preto", "vermelha":"vermelho",
                    "prateado":"prata", "prateada":"prata", "azul-marinho":"azul",
                    "amarela":"amarelo", "dourada":"dourado", "rosa":"rosa"}
    colors = frozenset(_color_canon.get(x,x) for x in colors_raw)
    # Tamanho declarado dentro do titulo, nao dimensoes logisticas apos 'Dimensoes:'.
    size = _canonical_product_dimensions(t, family)
    measures = {}
    for amount, unit in _WEIGHTS.findall(t):
        value = float(amount.replace(",", "."))
        if unit == "kg":unit,value="g",value*1000
        elif unit == "l":unit,value="ml",value*1000
        measures.setdefault(unit, set()).add(round(value,3))
    measures={k: frozenset(v) for k,v in measures.items()}
    ram = set(); storage = set()
    for m in _STORAGE.finditer(t):
        value=int(m.group(1))*(1024 if m.group(2)=="tb" else 1)
        before=t[max(0,m.start()-12):m.start()]
        after=t[m.end():min(len(t),m.end()+18)]
        # Apenas proximidade imediata (senao 256GB vira RAM por causa de "8GB RAM").
        if re.match(r"\s*(?:de\s+)?(?:ram|memoria\s+ram)\b",after) or re.search(r"\b(?:ram|memoria\s+ram)\s*(?:de\s+)?$",before):
            ram.add(value)
        elif re.match(r"\s*(?:de\s+)?(?:ssd|rom|armazenamento|interno)\b",after) or re.search(r"\b(?:ssd|rom|armazenamento)\s*(?:de\s+)?$",before):
            storage.add(value)
        else:
            # Em celulares a primeira capacidade GB sem rotulo e armazenamento.
            if family == "celular": storage.add(value)
    if family == "celular" and len(storage)>1 and ram:
        storage.difference_update(ram)
    # Identifica iPhone de geracoes/complementos diferentes.
    iphone = re.search(r"\biphone\s*(\d{1,2})\s*(pro\s+max|pro|plus|mini)?\b", t)
    series = _SERIES.search(t)
    gen = ("iphone", iphone.group(1), re.sub(r"\s+","",iphone.group(2) or "normal")) if iphone else None
    if series:
        series_name=re.sub(r"[^a-z]","", re.sub(r"\s*\d{1,2}$", "",series.group(0).lower()))
        gen = ("tenis", series_name,series.group(1))
    # 'Runfalcon' sem numero deve exigir revisao caso outro lado tenha geracao.
    series_root = next((x for x in ("runfalcon","gel nimbus","gel cumulus","gel venture","duramo")
                        if x in t.replace("-"," ")), None)
    brand=_explicit_brand(raw)
    if brand:brand = _BRAND_EQUIV.get(brand,brand)
    terms=_distinctive_tokens(raw)
    return {"text":clean,"family":family,"brand":brand,"models":models,
            "formula":formula,"volt":volt,"bivolt":bivolt,"colors":colors,
            "size":size,"measures":measures,"ram":frozenset(ram),
            "storage":frozenset(storage),"gen":gen,"series_root":series_root,
            "tire":tire,"tire_rating":tire_rating, "tire_c":tire_c, "tire_lt":tire_lt, "tire_homologation":tire_homologation,
            "multicolor":bool(re.search(r"\b(?:multi[- ]?colored|multicolorido|bicolor)\b",t)),
            "artcool":bool(family=="ar_condicionado" and re.search(r"\bartcool\b",t)),
            "tire_options":bool(family=="pneu" and re.search(r"\b(?:todas?\s+(?:as\s+)?opcoes|escolha\s+o\s+indice)\b", t)),
            "ac_capacity":ac_capacity,"ac_mode":ac_mode,
            "terms":terms}


def _variant_conflicts_v10(a:dict,b:dict):
    hard=[]; soft=[]
    if a["ac_capacity"] and b["ac_capacity"] and a["ac_capacity"] != b["ac_capacity"]:
        hard.append("capacidade BTU/h diferente")
    if a["ac_mode"] and b["ac_mode"] and a["ac_mode"] != b["ac_mode"]:
        hard.append("ciclo frio x quente/frio diferente")
    if a["tire_options"] or b["tire_options"]:
        soft.append("anuncio possui varias opcoes de variante de pneu")
    if a["tire_lt"] is not None and b["tire_lt"] is not None and a["tire_lt"] != b["tire_lt"]:
        soft.append("pneu LT comercial nao confirmado no outro titulo")
    if a["artcool"] != b["artcool"]:
        soft.append("linha Artcool ausente em um anuncio")
    if a["multicolor"] != b["multicolor"]:
        soft.append("variante multicolorida nao confirmada")
    if a["tire_c"] is not None and b["tire_c"] is not None and a["tire_c"] != b["tire_c"]:
        soft.append("especificacao de pneu comercial C nao confirmada no outro titulo")
    if (a["family"] or b["family"]) in {"bicicleta","cama_pet","mala","beliche","colchao","relogio"}:
        if bool(a["colors"]) != bool(b["colors"]):
            soft.append("cor nao informada em um dos titulos")
    if (a["family"] or b["family"]) in {"cafeteira"} and bool(a["volt"]) != bool(b["volt"]):
        soft.append("voltagem nao informada em um dos titulos")
    if a["tire_homologation"] and b["tire_homologation"] and a["tire_homologation"]!=b["tire_homologation"]:
        hard.append("homologacao comercial do pneu diferente")
    elif a["tire_homologation"] != b["tire_homologation"] and (a["tire_homologation"] or b["tire_homologation"]):
        soft.append("homologacao comercial do pneu nao especificada em um titulo")
    if a["tire"] and b["tire"] and a["tire"] != b["tire"]:
        hard.append("medida comercial do pneu diferente")
    if a["tire_rating"] and b["tire_rating"] and a["tire_rating"] != b["tire_rating"]:
        hard.append("indice de carga/velocidade do pneu diferente")
    if a["formula"] and b["formula"] and a["formula"] != b["formula"]:
        hard.append("formulacao EDP x EDT")
    # Voltagem 110 = 127 no Brasil; bivolt anunciado como uma unica variante
    # pode exigir conferencia se um titulo indica somente 220v ou 127v.
    if a["volt"] and b["volt"]:
        if len(a["volt"])>1 or len(b["volt"])>1:
            soft.append("anuncio com multiplas voltagens")
        elif a["volt"] != b["volt"] and not(a["bivolt"] or b["bivolt"]):
            hard.append("voltagem declarada diferente")
    if a["colors"] and b["colors"] and a["colors"].isdisjoint(b["colors"]):
        hard.append("cores declaradas diferentes")
    if a["size"] and b["size"] and a["size"].isdisjoint(b["size"]):
        hard.append("tamanho do produto diferente")
    elif (a["size"] != b["size"]) and (a["size"] or b["size"]):
        if (a["family"] or b["family"]) in _RELEVANT_VARIANT_TYPES:
            soft.append("tamanho comercial nao informado nos dois titulos")
    for key,label in (("ram","memoria RAM"),("storage","armazenamento")):
        if a[key] and b[key] and a[key].isdisjoint(b[key]):
            hard.append(label+" diferente")
    for unit in set(a["measures"]) & set(b["measures"]):
        if a["measures"][unit].isdisjoint(b["measures"][unit]):
            hard.append("quantidade/capacidade comercial diferente ("+unit+")")
    # Modelos da mesma familia detectados de forma inequívoca.
    if a["gen"] and b["gen"] and a["gen"] != b["gen"]:
        hard.append("geracao ou versao comercial diferente")
    if (a["gen"] is None)!=(b["gen"] is None) and (a["series_root"] and a["series_root"] == b["series_root"]):
        soft.append("geracao do modelo nao especificada em um titulo")
    if ((a["family"] == "tenis" or b["family"] == "tenis") and
        (("roller fun" in a["text"]) != ("roller fun" in b["text"])) and
        "bibi" in (a["brand"],b["brand"])):
        soft.append("linha Roller Fun omitida em um anuncio")
    if a["models"] and b["models"] and not (a["models"]&b["models"]):
        soft.append("codigos de modelo nao coincidem")
    return hard,soft


def decide_pair(raw_a:str,raw_b:str,sc:float,base_reason:str,row_a,row_b):
    """V10: a semelhanca textual NAO determina identidade sem evidencia comercial.

    Preserva as 3 classificacoes existentes para compatibilidade com o frontend.
    """
    a,b = _features_v10(raw_a),_features_v10(raw_b)
    ean=ean_state(row_a,row_b)
    fa,fb = a["family"],b["family"]
    same=bool(fa and fb and fa==fb)
    related=bool(fa and fb and frozenset((fa,fb)) in _RELATED_FAMILIES)
    incompatible=bool(fa and fb and fa!=fb and not related)
    brand_conflict=bool(a["brand"] and b["brand"] and a["brand"]!=b["brand"])
    hard,soft=_variant_conflicts_v10(a,b)
    common=a["terms"]&b["terms"]
    min_terms=min(len(a["terms"]),len(b["terms"]))
    max_terms=max(len(a["terms"]),len(b["terms"]))
    coverage=len(common)/min_terms if min_terms else 0.0
    depth=len(common)/max_terms if max_terms else 0.0
    # Permite tambem titulos compostos so por letras pontuadas (D.E.U.S.E.S.)
    # que antes tinham zero termos distintivos, apesar de serem identicos.
    compact_a, compact_b = _compact_commercial_title(raw_a), _compact_commercial_title(raw_b)
    exact=bool((a["text"] and a["text"]==b["text"]) or
               (len(compact_a)>=5 and compact_a==compact_b))
    model_same=a["models"] & b["models"]
    tire_same=bool(a["tire"] and b["tire"] and a["tire"]==b["tire"])
    if tire_same and (not a["tire_rating"] or not b["tire_rating"] or a["tire_rating"]==b["tire_rating"]):
        model_same = model_same | frozenset({"medida_pneu_compativel"})
    # Modelos explicitamente distintos sao bloqueio forte apenas quando existe
    # uma identificacao clara de familia/marca; ausencias sao incerteza.
    if a["models"] and b["models"] and not model_same and same and a["brand"] and b["brand"] and a["brand"]==b["brand"]:
        if len(a["models"])==len(b["models"])==1:
            hard.append("modelo comercial diferente")
    anchor=bool(model_same or (a["brand"] and b["brand"] and a["brand"]==b["brand"]
                    and len(common)>=2))
    # Descricao resumida: um bom modelo/linha em comum pode valer mais do que
    # o percentual, mas precisa de prova de familia e sem conflito de variante.
    contains=bool(min_terms>=2 and len(common)>=2 and (coverage>=0.89 or
        (anchor and same and len(common)>=4 and coverage>=0.70 and depth>=0.50)))
    strong_description=bool(exact or
        (contains and (depth>=0.50 or anchor) and (same or anchor or len(common)>=4)) or
        (anchor and same and len(common)>=2 and coverage>=0.65))
    likely=bool(same and ((len(common)>=1 and coverage>=0.30) or sc>=60)) or bool(
        related or (anchor and len(common)>=2) or
        ((fa is None or fb is None) and len(common)>=2 and coverage>=0.65))

    if incompatible or brand_conflict or hard:
        if ean=="IGUAL":
            status,faixa="REVISAR","CONFLITO_EVIDENCIAS"
            reason="EAN igual, porem dados comerciais incompativeis: conferir identificadores"
        else:
            status,faixa="DIFERENTE","INCOMPATIBILIDADE_COMERCIAL"
            parts=[]
            if incompatible:parts.append("familias distintas")
            if brand_conflict:parts.append("marcas diferentes")
            parts.extend(hard)
            reason="Incompatibilidade objetiva: "+", ".join(parts)
    elif related:
        status,faixa="REVISAR","FAMILIAS_RELACIONADAS"
        reason="Familias relacionadas: conferir se e kit, acessorio ou produto principal"
    elif soft and (likely or exact or anchor or same):
        status,faixa="REVISAR","VARIANTE_INCOMPLETA"
        reason="Variante ou identificador incompleto: "+", ".join(soft)
    elif ean=="DIFERENTE" and (strong_description or anchor):
        status,faixa="REVISAR","EAN_DIVERGENTE"
        reason="Textos/modelo parecem equivalentes, mas os EANs informados divergem"
    elif ean=="IGUAL":
        if same or strong_description:
            status,faixa="MATCH_SUGERIDO","EAN_COMPATIVEL"
            reason="EAN igual e produto/descricao compatível"
        else:
            status,faixa="REVISAR","EAN_SEM_CONFIRMACAO"
            reason="EAN igual, mas identidade comercial nao foi comprovada pelas descricoes"
    elif strong_description and (same or anchor or exact or fa is None or fb is None):
        status,faixa="MATCH_SUGERIDO","IDENTIDADE_COMERCIAL"
        reason=("Descricao principal equivalente" if exact else
                "Descricao resumida valida por familia/modelo e termos distintivos")
    elif likely:
        status,faixa="REVISAR","EVIDENCIA_PARCIAL"
        reason="Produtos relacionados, mas faltam evidencias de mesma variante comercial"
    else:
        status,faixa="DIFERENTE","SEM_IDENTIDADE_COMERCIAL"
        reason="Sem familia/modelo/termos suficientes para indicar o mesmo produto"
    detail=[reason,f"Tipo: {fa or '?'} x {fb or '?'}",f"EAN: {ean}",
            f"Cobertura da descricao curta: {coverage:.0%}",
            f"Termos especificos comuns: {len(common)}"]
    if a["brand"] or b["brand"]:
        detail.append(f"Marca: {a['brand'] or '?'} x {b['brand'] or '?'}")
    if model_same:
        detail.append("Modelo comum: "+", ".join(sorted(model_same)[:2]))
    if hard or soft:
        detail.append("Divergencias: "+", ".join(hard+soft))
    return status,faixa,"; ".join(detail)


def clean_text(value: object) -> str:
    raw = str(value) if value is not None else ""
    if raw in {"nan", "None", "NaT"}:
        return ""
    raw = unicodedata.normalize("NFKD", raw.lower())
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = raw.replace("×", "x").replace("*", "x")
    raw = re.sub(r"(\d)\s*[x]\s*(\d)", r"\1 x \2", raw)
    raw = re.sub(r"(\d)\s*(cm|mm|kg|ml|gb|tb|l)\b", r"\1 \2", raw)
    tokens = re.findall(r"[a-z]+|\d+(?:[.,]\d+)?", raw)
    return " ".join(SYNONYMS.get(t, t) for t in tokens if t not in STOPWORDS)


def salient_tokens(normalized: str) -> set[str]:
    return {t for t in normalized.split() if len(t) > 1 or t.isdigit()}


def split_description(raw: str) -> tuple[str, str]:
    """Metadados de dimensões após o nome são opcionais, não divergências."""
    core = re.split(r"\s*[-–—]?\s*dimens[oõ]es\s*\(.*?\)\s*:", str(raw), maxsplit=1, flags=re.I)
    return core[0].strip(), core[1].strip() if len(core) > 1 else ""


def attrs(normalized: str) -> tuple[set[str], dict[str, set[str]]]:
    tokens = normalized.split()
    colors = set(tokens) & COLORS
    specs: dict[str, set[str]] = defaultdict(set)
    # Só comparamos números com unidades expressas nos DOIS lados.
    # Números soltos podem ser modelos, quantidades ou tamanhos, sem equivalência inequívoca.
    for value, unit in re.findall(r"\b(\d+(?:[.,]\d+)?)\s*(gb|tb|kg|g|ml|l|cm|mm|v|w)\b", normalized):
        specs[unit].add(value.replace(",", "."))
    return colors, dict(specs)


def score_pair(a: str, b: str) -> tuple[float, str, bool]:
    if not a or not b:
        return 0.0, "Descrição vazia", True
    sort_score = fuzz.token_sort_ratio(a, b)
    set_score = fuzz.token_set_ratio(a, b)
    score = 0.6 * sort_score + 0.4 * set_score
    colors_a, specs_a = attrs(a)
    colors_b, specs_b = attrs(b)
    reasons: list[str] = []
    conflict = False
    if colors_a and colors_b and colors_a.isdisjoint(colors_b):
        conflict = True
        reasons.append("Cores declaradas incompatíveis")
    for unit in specs_a.keys() & specs_b.keys():
        if specs_a[unit].isdisjoint(specs_b[unit]):
            conflict = True
            reasons.append(f"Especificação explícita divergente ({unit})")
    if not conflict:
        reasons.append("Sem divergência explícita de atributos técnicos")
    # O score mede similaridade textual; um atributo conflitante não transforma
    # um produto em match aprovado, independentemente do percentual.
    return round(score, 2), "; ".join(reasons), conflict


async def parse_file(upload: UploadFile) -> pd.DataFrame:
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in SUPPORTED:
        raise HTTPException(400, f"Formato {ext or 'sem extensão'} não suportado. Formatos: {', '.join(sorted(SUPPORTED))}")
    raw = await upload.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, f"Arquivo excede {MAX_BYTES // (1024 * 1024)} MB")
    if not raw:
        raise HTTPException(400, "Arquivo vazio")
    try:
        if ext in {".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"}:
            engine = {".xls": "xlrd", ".xlsb": "pyxlsb", ".ods": "odf"}.get(ext, "openpyxl")
            df = pd.read_excel(io.BytesIO(raw), dtype=str, engine=engine)
        elif ext == ".parquet":
            df = pd.read_parquet(io.BytesIO(raw)).astype(str)
        else:
            try:
                contents = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                contents = raw.decode("cp1252", errors="replace")
            if ext in {".csv", ".tsv"}:
                if ext == ".tsv":
                    sep = "\t"
                else:
                    try:
                        sep = csv.Sniffer().sniff(contents[:8192], delimiters=",;\t|").delimiter
                    except csv.Error:
                        sep = ","
                df = pd.read_csv(io.StringIO(contents), sep=sep, dtype=str, keep_default_na=False)
            elif ext == ".txt":
                df = pd.DataFrame({"descricao": [line.strip() for line in contents.splitlines() if line.strip()]})
            elif ext in {".jsonl", ".ndjson"}:
                rows = [json.loads(line) for line in contents.splitlines() if line.strip()]
                df = pd.json_normalize(rows)
            elif ext == ".json":
                obj = json.loads(contents)
                if isinstance(obj, dict):
                    for key in ("produtos", "products", "items", "data", "results"):
                        if isinstance(obj.get(key), list):
                            obj = obj[key]
                            break
                if isinstance(obj, dict):
                    obj = [obj]
                if not isinstance(obj, list):
                    raise ValueError("JSON deve conter uma lista de produtos")
                df = pd.json_normalize(obj)
            else:
                root = SafeET.fromstring(contents)
                children = list(root)
                if len(children) == 1 and list(children[0]):
                    children = list(children[0])
                rows = [{c.tag.rsplit("}", 1)[-1]: (c.text or "") for c in item} for item in children]
                df = pd.DataFrame(rows)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Não foi possível ler o arquivo: {str(exc)[:200]}") from exc
    if df.empty or not len(df.columns):
        raise HTTPException(422, "Não foram encontrados registros e colunas")
    if len(df) > MAX_ROWS:
        raise HTTPException(413, f"Esta versão aceita até {MAX_ROWS:,} linhas por arquivo; recebido: {len(df):,}. Nenhum resultado parcial foi gerado.")
    df.columns = [str(col).strip() for col in df.columns]
    if len(set(df.columns)) != len(df.columns):
        raise HTTPException(422, "Existem colunas com nomes repetidos; renomeie antes de importar")
    return df.fillna("")


@app.get("/health")
def health():
    return {"status": "ok", "versao_motor": "10.1.0.1", "max_linhas": MAX_ROWS, "formatos": sorted(SUPPORTED)}


@app.post("/preview")
async def preview(file: Annotated[UploadFile, File()]):
    df = await parse_file(file)
    sample = df.head(5).astype(str).to_dict(orient="records")
    return {"nome": file.filename, "total": len(df), "colunas": df.columns.tolist(), "amostra": sample}


@app.post("/compare")
async def compare(
    file_a: Annotated[UploadFile, File()],
    file_b: Annotated[UploadFile, File()],
    col_a: Annotated[str, Form()],
    col_b: Annotated[str, Form()],
    modo: Annotated[str, Form()] = "cruzamento_1a1",
):
    if modo not in {"linha_a_linha", "cruzamento_1a1"}:
        raise HTTPException(422, "Modo de comparação inválido")
    a = await parse_file(file_a)
    b = await parse_file(file_b)
    if col_a not in a.columns or col_b not in b.columns:
        raise HTTPException(422, "Coluna de descrição não encontrada; confira o mapeamento")
    descriptions_a = [str(x).strip() for x in a[col_a]]
    descriptions_b = [str(x).strip() for x in b[col_b]]
    norm_a = [clean_text(split_description(x)[0]) for x in descriptions_a]
    norm_b = [clean_text(split_description(x)[0]) for x in descriptions_b]

    # Modo por posição: NÃO busca candidatos em outras linhas.
    # Cada A[i] é comparado SOMENTE com B[i]. Não há disputa nem VINCULO_PENDENTE.
    if modo == "linha_a_linha":
        if len(a) != len(b):
            raise HTTPException(422, f"Comparação linha a linha exige a mesma quantidade de registros: A={len(a):,}; B={len(b):,}. Confira se os arquivos estão alinhados.")
        results = []
        for i, (raw_a, raw_b, na, nb) in enumerate(zip(descriptions_a, descriptions_b, norm_a, norm_b)):
            if not na or not nb:
                sc, status, faixa = None, "SEM_CANDIDATO", "SEM_DADOS"
                reason = "Descrição ausente em uma ou nas duas colunas desta linha"
            else:
                sc, reason, conflicting = score_pair(na, nb)
                status, faixa, reason = decide_pair(raw_a, raw_b, sc, reason, a.iloc[i], b.iloc[i])
            results.append({"linha_a": i + 2, "descricao_a": raw_a,
                            "linha_b": i + 2, "descricao_b": raw_b, "score": sc,
                            "classificacao": status, "faixa": faixa,
                            "motivo": reason, "revisao": "PENDENTE"})
        totals = dict(Counter(r["classificacao"] for r in results))
        return {"total_a": len(a), "total_b": len(b), "totais": totals,
                "resultados": results,
                "avisos": ["MODO LINHA A LINHA: linha 2 A x linha 2 B, sem procurar em outras linhas.",
                           "Decisao por familia, atributos, EAN e evidencias; similaridade e apenas indicativa.",
                           "Categorias incompatíveis geram DIFERENTE, exceto se o EAN coincidir: nesse caso, REVISAR conflito de cadastro.",
                           "Atributos comerciais declarados e incompatíveis geram DIFERENTE; conflito com EAN igual exige REVISAR.",
                           "Sem classificação VÍNCULO PENDENTE neste modo; nenhuma exclusão é automática."]}

    # Cruzamento 1:1 v11 isolado: NÃO altera o modo linha a linha.
    from app.services.crossing_v11 import cross_1a1
    return cross_1a1(
        a, b, descriptions_a, descriptions_b, clean_text, split_description,
        score_pair, decide_pair, ean_value, ean_state,
    )

# Processa o JSON como fluxo: nao materializa 150+ MB em json.loads() de uma vez.
def _iter_resultados_json(file_obj):
    import io

    # O payload atual do navegador e uma lista JSON (JSON.stringify(data.resultados)).
    stream = io.TextIOWrapper(file_obj, encoding="utf-8-sig", newline="")
    decoder = json.JSONDecoder()
    buffer = ""
    pos = 0
    eof = False
    chunk_chars = 128 * 1024
    max_item_chars = 8 * 1024 * 1024

    def peek():
        nonlocal buffer, pos, eof
        while True:
            while pos < len(buffer) and buffer[pos] in " \r\n\t":
                pos += 1
            if pos < len(buffer):
                return buffer[pos]
            if eof:
                return None
            buffer = buffer[pos:]
            pos = 0
            data = stream.read(chunk_chars)
            if data:
                buffer += data
            else:
                eof = True

    try:
        if peek() != "[":
            raise HTTPException(422, "Resultados de exportacao devem ser uma lista JSON")
        pos += 1
        first = True
        while True:
            ch = peek()
            if ch is None:
                raise HTTPException(422, "JSON incompleto: falta fechar a lista")
            if ch == "]":
                pos += 1
                break
            if not first:
                if ch != ",":
                    raise HTTPException(422, "JSON invalido: separador entre resultados ausente")
                pos += 1
                if peek() in (None, "]"):
                    raise HTTPException(422, "JSON invalido: resultado ausente depois da virgula")
            first = False
            while True:
                # Descarta prefixos consumidos para limitar o uso de RAM.
                if pos >= chunk_chars:
                    buffer = buffer[pos:]
                    pos = 0
                try:
                    item, end = decoder.raw_decode(buffer, pos)
                    pos = end
                    yield item
                    break
                except json.JSONDecodeError as exc:
                    if eof:
                        raise HTTPException(422, "Resultados de exportacao contem JSON invalido") from exc
                    if len(buffer) - pos > max_item_chars:
                        raise HTTPException(413, "Um resultado individual excede 8 MB")
                    buffer = buffer[pos:]
                    pos = 0
                    chunk = stream.read(chunk_chars)
                    if not chunk:
                        eof = True
                    else:
                        buffer += chunk
        if peek() is not None:
            raise HTTPException(422, "JSON invalido: conteudo extra apos os resultados")
    except UnicodeError as exc:
        raise HTTPException(422, "Resultados de exportacao nao estao em UTF-8") from exc
    finally:
        # O FastAPI gerencia o ciclo de vida do UploadFile original.
        try:
            stream.detach()
        except Exception:
            pass


@app.post("/export")
async def export_full(
    file_a: Annotated[UploadFile, File()],
    resultados_json: Annotated[UploadFile, File()],
):
    """Exportacao de grande volume (ate 500 mil linhas, conforme limite de entrada).

    Mantem o contrato do frontend: recebe file_a e resultados_json em multipart.
    Le o JSON por itens e gera um XLSX temporario em disco, em vez de montar
    toda a lista JSON e todo o XLSX na memoria.
    """
    import os
    import tempfile
    from fastapi.responses import FileResponse
    from openpyxl import Workbook
    from starlette.background import BackgroundTask

    # A Base A ainda e processada pela rotina de importacao ja existente.
    df = await parse_file(file_a)

    json_file = resultados_json.file
    json_file.seek(0, os.SEEK_END)
    json_size = json_file.tell()
    json_file.seek(0)
    if json_size > 1024 * 1024 * 1024:
        raise HTTPException(413, "JSON excede 1 GB. Divida a exportacao em lotes")
    if json_size == 0:
        raise HTTPException(422, "Arquivo JSON de resultados esta vazio")

    headers_qa = [
        "QA_LINHA_A", "QA_LINHA_B", "QA_DESCRICAO_B", "QA_SIMILARIDADE_PERCENTUAL",
        "QA_FAIXA", "QA_STATUS", "QA_MOTIVO", "QA_REVISAO",
    ]
    existing = set(str(c) for c in df.columns)
    actual_headers = []
    for h in headers_qa:
        name = h
        while name in existing or name in actual_headers:
            name = "QA_" + name
        actual_headers.append(name)

    def excel_text(value):
        if value is None:
            return ""
        t = str(value)
        # Mitiga CSV/Excel formula injection, mesmo nas colunas QA.
        if t.lstrip().startswith(("=", "+", "-", "@")):
            return "'" + t[:32766]
        return t[:32767]

    fd, path = tempfile.mkstemp(prefix="precifica_qa_export_", suffix=".xlsx")
    os.close(fd)
    try:
        wb = Workbook(write_only=True)
        ws = wb.create_sheet("Resultados QA")
        ws.append([excel_text(x) for x in df.columns] + actual_headers)
        items = _iter_resultados_json(json_file)
        for line, row in enumerate(df.itertuples(index=False, name=None), start=2):
            try:
                r = next(items)
            except StopIteration:
                raise HTTPException(422, f"Resultados incompletos: faltou a linha {line}")
            if not isinstance(r, dict) or type(r.get("linha_a")) is not int:
                raise HTTPException(422, f"Linha QA invalida na posicao {line}")
            if r["linha_a"] != line:
                raise HTTPException(422, f"Resultados fora de ordem ou repetidos na linha {line}; reexecute a comparacao")
            score = r.get("score")
            if score is not None and (type(score) not in (float, int) or not 0 <= score <= 100):
                raise HTTPException(422, f"Score invalido na linha {line}")
            ws.append([excel_text(v) for v in row] + [
                line, r.get("linha_b"), excel_text(r.get("descricao_b", "")),
                score, excel_text(r.get("faixa", "")),
                excel_text(r.get("classificacao", "")),
                excel_text(r.get("motivo", "")), excel_text(r.get("revisao", "PENDENTE")),
            ])
        try:
            next(items)
        except StopIteration:
            pass
        else:
            raise HTTPException(422, "Ha mais resultados do que linhas na Base A")
        wb.save(path)
    except Exception:
        # Fecha o writer de streaming do openpyxl se ocorrer validacao/erro
        # no meio dos dados; sem isso ele deixa arquivos temporarios abertos.
        try:
            ws.close()
        except Exception:
            pass
        try:
            if getattr(ws, "_writer", None) is not None:
                ws._writer.cleanup()
        except Exception:
            pass
        if os.path.exists(path):
            os.unlink(path)
        raise
    return FileResponse(
        path,
        filename="precifica_qa_resultados_completos.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(os.unlink, path),
        headers={"Cache-Control": "no-store"},
    )

# Precifica QA: mÃ³dulo de validaÃ§Ã£o de URLs (independente do comparador)
from app.url_validator import router as url_validator_router
app.include_router(url_validator_router)

