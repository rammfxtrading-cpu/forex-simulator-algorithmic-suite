#!/usr/bin/env python3
"""
Dukascopy Historical Data Downloader
R.A.M.M.FX TRADING™ — Algorithmic Suite
--------------------------------------------
Descarga datos OHLCV de Dukascopy, convierte de .bi5 a JSON
y sube a Supabase Storage.

Uso:
  python3 dukascopy_download.py

Configuración en las variables de la sección CONFIG.
"""

import struct
import lzma
import requests
import json
import os
import time
from datetime import datetime, timedelta, timezone

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
SUPABASE_URL  = "https://epxoxxadclhfnwfuwoyx.supabase.co"
SUPABASE_KEY  = "sb_publishable_MgQDDCqHcsS09gjjzomrHA_5VkzBirJ"
BUCKET_NAME   = "dukascopy-data"

# Pares a descargar
PAIRS = [
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD",
    "USDCHF", "USDCAD", "USDJPY", "AUDCAD"
]

# Rango de fechas
YEAR_START  = 2023
YEAR_END    = 2023   # Cambiar a 2024 o más para más histórico

# Timeframe: "H1" por ahora (1 hora = 60 minutos)
TIMEFRAME_MINUTES = 60

# ─────────────────────────────────────────────
# DUKASCOPY URLs
# ─────────────────────────────────────────────
# Formato: /datafeed/EURUSD/YYYY/MM/DD/BID_candles_min_1.bi5
# MM es 0-indexed (enero = 00)
BASE_URL = "https://datafeed.dukascopy.com/datafeed"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.dukascopy.com/",
}

# ─────────────────────────────────────────────
# BI5 PARSER
# ─────────────────────────────────────────────
def parse_bi5(data: bytes, timestamp_base: datetime) -> list:
    """
    Parsea datos binarios .bi5 (LZMA comprimido) de Dukascopy.
    Cada tick: 4 bytes time_ms, 4 bytes ask, 4 bytes bid, 4 bytes ask_vol, 4 bytes bid_vol
    = 20 bytes por tick
    """
    if not data:
        return []
    try:
        raw = lzma.decompress(data)
    except Exception as e:
        print(f"    Error LZMA: {e}")
        return []

    ticks = []
    tick_size = 20
    point = 100000.0  # divisor para pares normales (5 decimales)

    for i in range(0, len(raw) - tick_size + 1, tick_size):
        chunk = raw[i:i + tick_size]
        time_ms, ask_raw, bid_raw, ask_vol_raw, bid_vol_raw = struct.unpack(">IIIff", chunk)
        ts = timestamp_base + timedelta(milliseconds=time_ms)
        mid = (ask_raw + bid_raw) / 2.0 / point
        ticks.append({
            "time": int(ts.timestamp()),
            "mid": round(mid, 5),
            "ask": round(ask_raw / point, 5),
            "bid": round(bid_raw / point, 5),
        })

    return ticks


def ticks_to_ohlcv(ticks: list, interval_minutes: int) -> list:
    """Agrupa ticks en velas OHLCV."""
    if not ticks:
        return []

    candles = {}
    interval_sec = interval_minutes * 60

    for tick in ticks:
        candle_ts = (tick["time"] // interval_sec) * interval_sec
        mid = tick["mid"]
        if candle_ts not in candles:
            candles[candle_ts] = {
                "time": candle_ts,
                "open": mid, "high": mid,
                "low": mid,  "close": mid,
                "volume": 1
            }
        else:
            c = candles[candle_ts]
            c["high"]   = max(c["high"], mid)
            c["low"]    = min(c["low"],  mid)
            c["close"]  = mid
            c["volume"] += 1

    return sorted(candles.values(), key=lambda x: x["time"])


# ─────────────────────────────────────────────
# SUPABASE STORAGE
# ─────────────────────────────────────────────
def ensure_bucket():
    """Crea el bucket si no existe."""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    # Intentar crear (si ya existe devuelve error 409, lo ignoramos)
    resp = requests.post(url, headers=headers, json={
        "id": BUCKET_NAME,
        "name": BUCKET_NAME,
        "public": True,
    })
    if resp.status_code in (200, 201):
        print(f"✅ Bucket '{BUCKET_NAME}' creado")
    elif resp.status_code == 409:
        print(f"✅ Bucket '{BUCKET_NAME}' ya existe")
    else:
        print(f"⚠️  Bucket status: {resp.status_code} — {resp.text}")


def upload_to_supabase(path: str, data: bytes):
    """Sube un archivo a Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "x-upsert": "true",
    }
    resp = requests.post(url, headers=headers, data=data)
    if resp.status_code in (200, 201):
        print(f"    ✅ Subido: {path}")
    else:
        print(f"    ❌ Error subiendo {path}: {resp.status_code} — {resp.text[:100]}")


# ─────────────────────────────────────────────
# DESCARGA PRINCIPAL
# ─────────────────────────────────────────────
def download_pair_year(pair: str, year: int):
    """Descarga todos los días de un año para un par y los agrupa en velas H1."""
    print(f"\n📥 {pair} {year}")
    all_candles = []

    pair_upper = pair.upper()
    # Dukascopy usa divisor 1000 para JPY
    is_jpy = "JPY" in pair_upper

    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end   = datetime(year, 12, 31, tzinfo=timezone.utc)
    current = start

    day_count = 0
    while current <= end:
        y  = current.year
        m  = current.month - 1   # 0-indexed
        d  = current.day
        url = f"{BASE_URL}/{pair_upper}/{y:04d}/{m:02d}/{d:02d}/BID_candles_min_1.bi5"

        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200 and len(resp.content) > 0:
                ticks = parse_bi5(resp.content, current)
                # Ajuste JPY (3 decimales)
                if is_jpy:
                    for t in ticks:
                        t["mid"]  = round(t["mid"]  * 100, 3)
                        t["ask"]  = round(t["ask"]  * 100, 3)
                        t["bid"]  = round(t["bid"]  * 100, 3)
                candles = ticks_to_ohlcv(ticks, TIMEFRAME_MINUTES)
                all_candles.extend(candles)
                day_count += 1
                if day_count % 30 == 0:
                    print(f"  📅 {current.strftime('%Y-%m-%d')} — {len(all_candles)} velas acumuladas")
            # 404 = día sin datos (fin de semana/festivo), lo ignoramos
        except Exception as e:
            print(f"  ⚠️  {current.strftime('%Y-%m-%d')}: {e}")

        current += timedelta(days=1)
        time.sleep(0.05)  # Ser respetuosos con el servidor

    if not all_candles:
        print(f"  ⚠️  Sin datos para {pair} {year}")
        return

    # Ordenar y deduplicar
    seen = set()
    unique = []
    for c in sorted(all_candles, key=lambda x: x["time"]):
        if c["time"] not in seen:
            seen.add(c["time"])
            unique.append(c)

    print(f"  📊 Total velas H1: {len(unique)}")

    # Subir a Supabase Storage como JSON
    storage_path = f"{pair_upper}/H1/{year}.json"
    json_bytes = json.dumps(unique).encode("utf-8")
    upload_to_supabase(storage_path, json_bytes)

    # También guardar local como backup
    os.makedirs(f"data/{pair_upper}/H1", exist_ok=True)
    with open(f"data/{pair_upper}/H1/{year}.json", "w") as f:
        json.dump(unique, f)
    print(f"  💾 Guardado local: data/{pair_upper}/H1/{year}.json")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("Algorithmic Suite — Dukascopy Downloader")
    print("=" * 50)

    ensure_bucket()

    for pair in PAIRS:
        for year in range(YEAR_START, YEAR_END + 1):
            download_pair_year(pair, year)

    print("\n🎉 Descarga completada")
    print(f"Datos disponibles en Supabase Storage: {BUCKET_NAME}/")
    print("Estructura: EURUSD/H1/2023.json, GBPUSD/H1/2023.json, ...")
