#
# Flask server for AilurusGIS (Landing + Map) with Relational Analytics
#
# Run: python server.py
#

import os
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, request

# ИМПОРТ МОДУЛЕЙ ИЗ PythonFiles
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
    log_page_view = lambda page, req: None  # Заглушка, если файл не найден

app = Flask(__name__, static_folder=".", static_url_path="")

# РЕГИСТРАЦИЯ BLUEPRINTS
if poi_bp:
    app.register_blueprint(poi_bp)
if analytics_bp:
    app.register_blueprint(analytics_bp)


# ============================================================
# ОСНОВНЫЕ МАРШРУТЫ (САЙТ И КАРТА)
# ============================================================

@app.route("/")
def root():
    # Используем новую функцию логирования, вынесенную в analytics_api
    log_page_view('landing_page', request)
    return app.send_static_file("index_main.html")

@app.route("/map")
def map_page():
    log_page_view('map_page', request)
    return app.send_static_file("index_cesium.html")


# ============================================================
# API ПРОКСИ (Погода, Города, Границы, Спутники)
# ============================================================

AQICN_API_BASE = "https://api.waqi.info"
AQICN_DEFAULT_TOKEN = "68f7e90d5c4016cf4a7e1ebc8b685acf315a246d"
OPEN_METEO_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_CACHE = {}

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
    token = request.args.get("token") or get_aqicn_token()
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
    params = request.args.to_dict(flat=True)
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
    db_path = os.path.join(os.path.dirname(__file__), 'DB', 'world_locations.db')
    if not os.path.exists(db_path):
        return jsonify({"error": "База данных не найдена"}), 500
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM locations WHERE full_name_nd LIKE ? LIMIT 50", (f'%{query}%',))
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/borders/shp")
def borders_shp():
    shp_path = os.path.join(os.path.dirname(__file__), 'GeoData', 'Borders', 'ne_10m_admin_0_countries_lakes.shp')
    if not os.path.exists(shp_path):
        return jsonify({"error": f"Файл {shp_path} не найден"}), 404
    try:
        import shapefile
        with open(shp_path, "rb") as f_shp:
            reader = shapefile.Reader(shp=f_shp)
            features = [{"type": "Feature", "geometry": getattr(s, "__geo_interface__", None), "properties": {}} for s in reader.shapes()]
            return jsonify({"type": "FeatureCollection", "features": features})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        except:
            continue
    return jsonify({"error": "Could not fetch satellite.js"}), 502


@app.after_request
def after_request(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response

if __name__ == "__main__":
    print("=====================================================")
    print(" Сервер AilurusGIS запущен!")
    print(" Лендинг: http://localhost:50010/")
    print(" Карта:   http://localhost:50010/map")
    print(" Новая БД Аналитики: DB/analytics_v2.db")
    print(" Статистика: http://localhost:50010/api/analytics/stats")
    print("=====================================================")
    app.run(host="0.0.0.0", port=50010, debug=False, use_reloader=False, threaded=True)