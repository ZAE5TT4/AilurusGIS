import json
import os
import re
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, request, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

#load local secrets
def load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('\"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
load_env_file(os.path.join(BASE_DIR, ".env"))

#load api modules
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'PythonFiles'))

try:
    from poi_api import poi_bp
except ImportError as e:
    print(f"Внимание: Не удалось загрузить poi_api. Ошибка: {e}")
    poi_bp = None
try:
    from analytics_api import analytics_bp, log_page_view
except ImportError as e:
    print(f"Внимание: Не удалось загрузить analytics_api. Ошибка: {e}")
    analytics_bp = None
    log_page_view = lambda page, req: None
app = Flask(__name__, static_folder=".", static_url_path="")

#protect private files
BLOCKED_EXTENSIONS = {'.py', '.db', '.sqlite', '.sqlite3', '.pyc'}
BLOCKED_PATHS = {'PythonFiles', 'DB', '__pycache__', '.git', '.vscode'}
BLOCKED_FILES = {'.env', '.env.example', '.gitignore'}

@app.before_request
def block_sensitive_files():
    path = request.path.lstrip('/')
    path_lower = path.lower()
    if path_lower in BLOCKED_FILES:
        abort(403)
    for ext in BLOCKED_EXTENSIONS:
        if path_lower.endswith(ext):
            abort(403)
    for blocked in BLOCKED_PATHS:
        if path_lower.startswith(blocked.lower() + '/') or path_lower == blocked.lower():
            abort(403)
if poi_bp:
    app.register_blueprint(poi_bp)
if analytics_bp:
    app.register_blueprint(analytics_bp)
@app.route("/")

def root():
    log_page_view('landing_page', request)
    return app.send_static_file("index_main.html")
@app.route("/map")

def map_page():
    log_page_view('map_page', request)
    return app.send_static_file("index_cesium.html")
#proxy external apis
AQICN_API_BASE = "https://api.waqi.info"

AQICN_DEFAULT_TOKEN = os.environ.get("AQICN_API_TOKEN", "")
OPEN_METEO_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_API_KEY = os.environ.get("OPEN_METEO_API_KEY", "")
OPEN_METEO_CACHE = {}

OPEN_METEO_CACHE_MAX_SIZE = 500

def cleanup_cache():
    now = time.time()
    expired_keys = [k for k, v in OPEN_METEO_CACHE.items() if now - v.get('timestamp', 0) > 3600]
    for k in expired_keys:
        del OPEN_METEO_CACHE[k]
    if len(OPEN_METEO_CACHE) > OPEN_METEO_CACHE_MAX_SIZE:
        sorted_keys = sorted(OPEN_METEO_CACHE.keys(), key=lambda k: OPEN_METEO_CACHE[k].get('timestamp', 0))
        for k in sorted_keys[:len(OPEN_METEO_CACHE) - OPEN_METEO_CACHE_MAX_SIZE]:
            del OPEN_METEO_CACHE[k]
def get_aqicn_token():
    return os.environ.get("AQICN_API_TOKEN") or os.environ.get("AQICN_API_KEY") or AQICN_DEFAULT_TOKEN
def parse_float(name):
    value = request.args.get(name)
    if value is None:
        raise ValueError(f"Missing query parameter: {name}")
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"Invalid float for {name}: {value}") from exc
def proxy_aqicn(path, params):
    token = get_aqicn_token()
    if not token:
        return jsonify({"status": "error", "data": "AQICN token is not configured on the server."}), 500
    query = dict(params)
    query["token"] = token
    url = f"{AQICN_API_BASE}{path}?{urlencode(query)}"
    upstream_request = Request(url, headers={"User-Agent": "AilurusGIS/1.0"})
    try:
        with urlopen(upstream_request, timeout=15) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "application/json")
            return Response(body, status=response.status, content_type=content_type)
    except HTTPError as error:
        error_body = error.read()
        return Response(error_body, status=error.code, content_type=error.headers.get("Content-Type", "application/json"))
    except URLError as error:
        return jsonify({"status": "error", "data": f"AQICN upstream error: {error}"}), 502
def proxy_open_meteo(base_url, ttl_seconds):
    cleanup_cache()
    params = request.args.to_dict(flat=True)
    params.pop("apikey", None)
    if OPEN_METEO_API_KEY:
        params["apikey"] = OPEN_METEO_API_KEY
    cache_key = f"{base_url}?{urlencode(sorted(params.items()), doseq=True)}"
    cached = OPEN_METEO_CACHE.get(cache_key)
    if cached and time.time() - cached["timestamp"] <= ttl_seconds:
        response = Response(cached["body"], status=cached["status"], content_type=cached["content_type"])
        response.headers["X-Proxy-Cache"] = "HIT"
        return response
    url = f"{base_url}?{urlencode(params, doseq=True)}"
    upstream_request = Request(url, headers={"User-Agent": "AilurusGIS/1.0"})
    try:
        with urlopen(upstream_request, timeout=20) as upstream_response:
            body = upstream_response.read()
            content_type = upstream_response.headers.get("Content-Type", "application/json")
            OPEN_METEO_CACHE[cache_key] = {
                "timestamp": time.time(),
                "status": upstream_response.status,
                "content_type": content_type,
                "body": body,
            }
            response = Response(body, status=upstream_response.status, content_type=content_type)
            response.headers["X-Proxy-Cache"] = "MISS"
            return response
    except HTTPError as error:
        return Response(error.read(), status=error.code, content_type=error.headers.get("Content-Type", "application/json"))
    except URLError as error:
        return jsonify({"error": f"Open-Meteo upstream error: {error}"}), 502
#serve runtime config
@app.route("/api/runtime-config.js")
def runtime_config():
    config = {"cesiumIonToken": os.environ.get("CESIUM_ION_TOKEN", "")}
    script = "window.AILURUS_CONFIG = " + json.dumps(config, ensure_ascii=False) + ";"
    response = Response(script, content_type="application/javascript; charset=utf-8")
    response.headers["Cache-Control"] = "no-store"
    return response
@app.route("/api/aqi/bounds")

def aqi_bounds():
    try:
        lat_min, lon_min = parse_float("latMin"), parse_float("lonMin")
        lat_max, lon_max = parse_float("latMax"), parse_float("lonMax")
    except ValueError as error:
        return jsonify({"status": "error", "data": str(error)}), 400
    return proxy_aqicn("/map/bounds/", {"latlng": f"{lat_min},{lon_min},{lat_max},{lon_max}"})
@app.route("/api/aqi/geo")

def aqi_geo():
    try:
        lat, lon = parse_float("lat"), parse_float("lon")
    except ValueError as error:
        return jsonify({"status": "error", "data": str(error)}), 400
    return proxy_aqicn(f"/feed/geo:{lat};{lon}/", {})
@app.route("/api/open-meteo/forecast")

def open_meteo_forecast():
    return proxy_open_meteo(OPEN_METEO_FORECAST_BASE, ttl_seconds=600)
@app.route("/api/open-meteo/air-quality")

def open_meteo_air_quality():
    return proxy_open_meteo(OPEN_METEO_AIR_QUALITY_BASE, ttl_seconds=1800)
@app.route("/api/cities/search")

def search_cities():
    query = request.args.get("q", "").strip()
    if not query or len(query) < 2:
        return jsonify([])
    if len(query) > 100:
        return jsonify({"error": "Слишком длинный запрос"}), 400
    db_path = os.path.join(os.path.dirname(__file__), 'DB', 'world_locations.db')
    if not os.path.exists(db_path):
        return jsonify({"error": "База данных не найдена"}), 500
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        safe_query = query.replace('%', '\\%').replace('_', '\\_')
        cursor.execute("SELECT * FROM locations WHERE full_name_nd LIKE ? ESCAPE '\\' LIMIT 50", (f'%{safe_query}%',))
        rows = cursor.fetchall()
        results = []
        for row in rows:
            row_dict = dict(row)
            lat = lon = None
            for key, value in row_dict.items():
                if key.lower() in ['lat', 'latitude', 'lat_y']:
                    lat = value
                elif key.lower() in ['lon', 'lng', 'longitude', 'long', 'lon_x']:
                    lon = value
            results.append({
                "name": row_dict.get("full_name_nd", "Неизвестно"),
                "country_code": row_dict.get("cc_iso", ""),
                "lat": lat, "lon": lon
            })
        conn.close()
        return jsonify(results)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": "Ошибка поиска в базе данных"}), 500
@app.route("/api/borders/custom2")
@app.route("/api/borders/kazakhstan")

def borders_custom2_geojson():
    geojson_path = os.path.join(os.path.dirname(__file__), 'GeoData', 'Borders', 'CustomBorders2.json')
    if not os.path.exists(geojson_path):
        return jsonify({"error": "GeoJSON файл CustomBorders2.json не найден на сервере"}), 404
    try:
        with open(geojson_path, "rb") as f_geojson:
            return Response(f_geojson.read(), mimetype="application/geo+json")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/api/borders/shp")

def borders_shp():
    return borders_custom2_geojson()
CELESTRAK_TLE_BASE = "https://celestrak.org/NORAD/elements/gp.php"
TLE_CACHE = {}
TLE_CACHE_TTL = 60 * 60

@app.route("/api/tle")

def proxy_tle():
    group = request.args.get("group", "active").strip().lower()
    if group not in {"active", "starlink", "stations", "weather", "noaa", "goes", "resource"}:
        return jsonify({"error": f"Group '{group}' not allowed"}), 400
    cached = TLE_CACHE.get(group)
    if cached and time.time() - cached["timestamp"] < TLE_CACHE_TTL:
        return Response(cached["body"], status=200, content_type="text/plain; charset=utf-8")
    url = f"{CELESTRAK_TLE_BASE}?GROUP={group}&FORMAT=tle"
    try:
        with urlopen(Request(url, headers={"User-Agent": "AilurusGIS/1.0"}), timeout=30) as response:
            body = response.read()
            TLE_CACHE[group] = {"timestamp": time.time(), "body": body}
            return Response(body, status=200, content_type="text/plain; charset=utf-8")
    except Exception as e:
        return jsonify({"error": str(e)}), 502
SATELLITE_JS_CACHE = {"body": None, "timestamp": 0}

@app.route("/api/satellite-js")

def proxy_satellite_js():
    global SATELLITE_JS_CACHE
    if SATELLITE_JS_CACHE["body"] and time.time() - SATELLITE_JS_CACHE["timestamp"] < 604800:
        return Response(SATELLITE_JS_CACHE["body"], status=200, content_type="application/javascript; charset=utf-8")
    for url in ["https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js"]:
        try:
            with urlopen(Request(url, headers={"User-Agent": "AilurusGIS/1.0"}), timeout=15) as response:
                body = response.read()
                SATELLITE_JS_CACHE = {"body": body, "timestamp": time.time()}
                return Response(body, status=200, content_type="application/javascript; charset=utf-8")
        except Exception:
            continue
    return jsonify({"error": "Could not fetch satellite.js"}), 502
@app.after_request

def after_request(response):
    path = request.path
    if path.startswith('/api/open-meteo/') or path.startswith('/api/aqi/') or path.startswith('/api/tle') or path.startswith('/api/satellite-js'):
        response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response
#start local server
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 50010))
    print("=====================================================")
    print(f" Сервер AilurusGIS запущен на порту {port}!")
    print(f" Лендинг: http://localhost:{port}/")
    print(f" Карта:   http://localhost:{port}/map")
    print(f" Статистика: http://localhost:{port}/api/analytics/stats")
    print("=====================================================")
    app.run(
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False,
        threaded=True
    )
