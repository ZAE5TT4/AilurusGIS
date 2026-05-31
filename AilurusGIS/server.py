#
# flask server for ailurusgis (landing + map) with relational analytics
#
# run: python server.py
#

import os
import re
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, request, abort

# импорт модулей из pythonfiles
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), 'PythonFiles'))

# начало блока перехвата ошибок
try:
    from poi_api import poi_bp
# обработка ошибки
except ImportError as e:
    print(f"Внимание: Не удалось загрузить poi_api. Ошибка: {e}")
    poi_bp = None

# начало блока перехвата ошибок
try:
    from analytics_api import analytics_bp, log_page_view
# обработка ошибки
except ImportError as e:
    print(f"Внимание: Не удалось загрузить analytics_api. Ошибка: {e}")
    analytics_bp = None
    log_page_view = lambda page, req: None  # Заглушка, если файл не найден

app = Flask(__name__, static_folder=".", static_url_path="")

# защита от доступа к серверным файлам через статику
BLOCKED_EXTENSIONS = {'.py', '.db', '.sqlite', '.sqlite3', '.pyc'}
BLOCKED_PATHS = {'PythonFiles', 'DB', '__pycache__', '.git', '.vscode'}

@app.before_request
def block_sensitive_files():
    # блокирует доступ к серверным и конфигурационным файлам
    path = request.path.lstrip('/')
    path_lower = path.lower()
    # проверка расширения файла
    for ext in BLOCKED_EXTENSIONS:
        if path_lower.endswith(ext):
            abort(403)
    # проверка запрещённых директорий
    for blocked in BLOCKED_PATHS:
        if path_lower.startswith(blocked.lower() + '/') or path_lower == blocked.lower():
            abort(403)

# регистрация blueprints
if poi_bp:
    app.register_blueprint(poi_bp)
# проверка условия
if analytics_bp:
    app.register_blueprint(analytics_bp)


#
# основные маршруты (сайт и карта)
#

@app.route("/")
# объявление функции
def root():
    # используем новую функцию логирования вынесенную в analytics_api
    log_page_view('landing_page', request)
    # возврат результата
    return app.send_static_file("index_main.html")

@app.route("/map")
# объявление функции
def map_page():
    log_page_view('map_page', request)
    # возврат результата
    return app.send_static_file("index_cesium.html")


#
# api прокси (погода города границы спутники)
#

AQICN_API_BASE = "https://api.waqi.info"
# токен загружается из переменной окружения или используется значение по умолчанию
AQICN_DEFAULT_TOKEN = os.environ.get("AQICN_API_TOKEN", "68f7e90d5c4016cf4a7e1ebc8b685acf315a246d")
OPEN_METEO_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_CACHE = {}
# максимальный размер кэша для предотвращения утечки памяти
OPEN_METEO_CACHE_MAX_SIZE = 500

# объявление функции
def cleanup_cache():
    # удаляет устаревшие записи из кэша и ограничивает его размер
    now = time.time()
    expired_keys = [k for k, v in OPEN_METEO_CACHE.items() if now - v.get('timestamp', 0) > 3600]
    for k in expired_keys:
        del OPEN_METEO_CACHE[k]
    # если кэш всё ещё слишком большой удаляет самые старые записи
    if len(OPEN_METEO_CACHE) > OPEN_METEO_CACHE_MAX_SIZE:
        sorted_keys = sorted(OPEN_METEO_CACHE.keys(), key=lambda k: OPEN_METEO_CACHE[k].get('timestamp', 0))
        for k in sorted_keys[:len(OPEN_METEO_CACHE) - OPEN_METEO_CACHE_MAX_SIZE]:
            del OPEN_METEO_CACHE[k]

# объявление функции
def get_aqicn_token():
    # возврат результата
    return os.environ.get("AQICN_API_TOKEN") or os.environ.get("AQICN_API_KEY") or AQICN_DEFAULT_TOKEN

# объявление функции
def parse_float(name):
    value = request.args.get(name)
    # проверка условия
    if value is None:
        raise ValueError(f"Missing query parameter: {name}")
    # начало блока перехвата ошибок
    try:
        # возврат результата
        return float(value)
    # обработка ошибки
    except ValueError as exc:
        raise ValueError(f"Invalid float for {name}: {value}") from exc

# объявление функции
def proxy_aqicn(path, params):
    token = request.args.get("token") or get_aqicn_token()
    # проверка условия
    if not token:
        # возврат результата
        return jsonify({"status": "error", "data": "AQICN token is not configured on the server."}), 500
    query = dict(params)
    query["token"] = token
    url = f"{AQICN_API_BASE}{path}?{urlencode(query)}"
    upstream_request = Request(url, headers={"User-Agent": "AilurusGIS/1.0"})
    # начало блока перехвата ошибок
    try:
        with urlopen(upstream_request, timeout=15) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "application/json")
            # возврат результата
            return Response(body, status=response.status, content_type=content_type)
    # обработка ошибки
    except HTTPError as error:
        error_body = error.read()
        # возврат результата
        return Response(error_body, status=error.code, content_type=error.headers.get("Content-Type", "application/json"))
    # обработка ошибки
    except URLError as error:
        # возврат результата
        return jsonify({"status": "error", "data": f"AQICN upstream error: {error}"}), 502

# объявление функции
def proxy_open_meteo(base_url, ttl_seconds):
    # очистка кэша от устаревших записей перед использованием
    cleanup_cache()
    params = request.args.to_dict(flat=True)
    cache_key = f"{base_url}?{urlencode(sorted(params.items()), doseq=True)}"
    cached = OPEN_METEO_CACHE.get(cache_key)
    
    # проверка условия
    if cached and time.time() - cached["timestamp"] <= ttl_seconds:
        response = Response(cached["body"], status=cached["status"], content_type=cached["content_type"])
        response.headers["X-Proxy-Cache"] = "HIT"
        # возврат результата
        return response
        
    url = f"{base_url}?{urlencode(params, doseq=True)}"
    upstream_request = Request(url, headers={"User-Agent": "AilurusGIS/1.0"})
    # начало блока перехвата ошибок
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
            # возврат результата
            return response
    # обработка ошибки
    except HTTPError as error:
        # возврат результата
        return Response(error.read(), status=error.code, content_type=error.headers.get("Content-Type", "application/json"))
    # обработка ошибки
    except URLError as error:
        # возврат результата
        return jsonify({"error": f"Open-Meteo upstream error: {error}"}), 502


@app.route("/api/aqi/bounds")
# объявление функции
def aqi_bounds():
    # начало блока перехвата ошибок
    try:
        lat_min, lon_min = parse_float("latMin"), parse_float("lonMin")
        lat_max, lon_max = parse_float("latMax"), parse_float("lonMax")
    # обработка ошибки
    except ValueError as error:
        # возврат результата
        return jsonify({"status": "error", "data": str(error)}), 400
    # возврат результата
    return proxy_aqicn("/map/bounds/", {"latlng": f"{lat_min},{lon_min},{lat_max},{lon_max}"})

@app.route("/api/aqi/geo")
# объявление функции
def aqi_geo():
    # начало блока перехвата ошибок
    try:
        lat, lon = parse_float("lat"), parse_float("lon")
    # обработка ошибки
    except ValueError as error:
        # возврат результата
        return jsonify({"status": "error", "data": str(error)}), 400
    # возврат результата
    return proxy_aqicn(f"/feed/geo:{lat};{lon}/", {})

@app.route("/api/open-meteo/forecast")
# объявление функции
def open_meteo_forecast():
    # возврат результата
    return proxy_open_meteo(OPEN_METEO_FORECAST_BASE, ttl_seconds=600)

@app.route("/api/open-meteo/air-quality")
# объявление функции
def open_meteo_air_quality():
    # возврат результата
    return proxy_open_meteo(OPEN_METEO_AIR_QUALITY_BASE, ttl_seconds=1800)

@app.route("/api/cities/search")
# объявление функции
def search_cities():
    query = request.args.get("q", "").strip()
    # проверка условия
    if not query or len(query) < 2:
        # возврат результата
        return jsonify([])
    # ограничение длины запроса для безопасности
    if len(query) > 100:
        return jsonify({"error": "Слишком длинный запрос"}), 400
    db_path = os.path.join(os.path.dirname(__file__), 'DB', 'world_locations.db')
    # проверка условия
    if not os.path.exists(db_path):
        # возврат результата
        return jsonify({"error": "База данных не найдена"}), 500
    # начало блока перехвата ошибок
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # экранирование спецсимволов LIKE для защиты от SQL инъекций
        safe_query = query.replace('%', '\\%').replace('_', '\\_')
        cursor.execute("SELECT * FROM locations WHERE full_name_nd LIKE ? ESCAPE '\\' LIMIT 50", (f'%{safe_query}%',))
        rows = cursor.fetchall()
        results = []
        # начало цикла
        for row in rows:
            row_dict = dict(row)
            lat = lon = None
            # начало цикла
            for key, value in row_dict.items():
                # проверка условия
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
        # возврат результата
        return jsonify(results)
    # обработка ошибки
    except Exception as e:
        # закрытие соединения при ошибке
        try:
            conn.close()
        except Exception:
            pass
        # возврат результата
        return jsonify({"error": "Ошибка поиска в базе данных"}), 500

@app.route("/api/borders/shp")
# объявление функции
def borders_shp():
    shp_path = os.path.join(os.path.dirname(__file__), 'GeoData', 'Borders', 'ne_10m_admin_0_countries_lakes.shp')
    # проверка условия
    if not os.path.exists(shp_path):
        # возврат результата (без раскрытия серверного пути клиенту)
        return jsonify({"error": "Файл границ не найден на сервере"}), 404
    # начало блока перехвата ошибок
    try:
        import shapefile
        with open(shp_path, "rb") as f_shp:
            reader = shapefile.Reader(shp=f_shp)
            features = [{"type": "Feature", "geometry": getattr(s, "__geo_interface__", None), "properties": {}} for s in reader.shapes()]
            # возврат результата
            return jsonify({"type": "FeatureCollection", "features": features})
    # обработка ошибки
    except Exception as e:
        # возврат результата
        return jsonify({"error": str(e)}), 500


CELESTRAK_TLE_BASE = "https://celestrak.org/NORAD/elements/gp.php"
TLE_CACHE = {}
TLE_CACHE_TTL = 60 * 60

@app.route("/api/tle")
# объявление функции
def proxy_tle():
    group = request.args.get("group", "active").strip().lower()
    # проверка условия
    if group not in {"active", "starlink", "stations", "weather", "noaa", "goes", "resource"}:
        # возврат результата
        return jsonify({"error": f"Group '{group}' not allowed"}), 400
    cached = TLE_CACHE.get(group)
    # проверка условия
    if cached and time.time() - cached["timestamp"] < TLE_CACHE_TTL:
        # возврат результата
        return Response(cached["body"], status=200, content_type="text/plain; charset=utf-8")
    url = f"{CELESTRAK_TLE_BASE}?GROUP={group}&FORMAT=tle"
    # начало блока перехвата ошибок
    try:
        with urlopen(Request(url, headers={"User-Agent": "AilurusGIS/1.0"}), timeout=30) as response:
            body = response.read()
            TLE_CACHE[group] = {"timestamp": time.time(), "body": body}
            # возврат результата
            return Response(body, status=200, content_type="text/plain; charset=utf-8")
    # обработка ошибки
    except Exception as e:
        # возврат результата
        return jsonify({"error": str(e)}), 502


SATELLITE_JS_CACHE = {"body": None, "timestamp": 0}

@app.route("/api/satellite-js")
# объявление функции
def proxy_satellite_js():
    global SATELLITE_JS_CACHE
    # проверка условия
    if SATELLITE_JS_CACHE["body"] and time.time() - SATELLITE_JS_CACHE["timestamp"] < 604800:
        # возврат результата
        return Response(SATELLITE_JS_CACHE["body"], status=200, content_type="application/javascript; charset=utf-8")
    # начало цикла
    for url in ["https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js"]:
        # начало блока перехвата ошибок
        try:
            with urlopen(Request(url, headers={"User-Agent": "AilurusGIS/1.0"}), timeout=15) as response:
                body = response.read()
                SATELLITE_JS_CACHE = {"body": body, "timestamp": time.time()}
                # возврат результата
                return Response(body, status=200, content_type="application/javascript; charset=utf-8")
        # обработка ошибки
        except Exception:
            continue
    # возврат результата
    return jsonify({"error": "Could not fetch satellite.js"}), 502


@app.after_request
# объявление функции
def after_request(response):
    # cors разрешён только для api прокси маршрутов (не для аналитики и poi)
    path = request.path
    if path.startswith('/api/open-meteo/') or path.startswith('/api/aqi/') or path.startswith('/api/tle') or path.startswith('/api/satellite-js'):
        response.headers.add("Access-Control-Allow-Origin", "*")
    # заголовки безопасности
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    # возврат результата
    return response

# проверка условия
if __name__ == "__main__":
    print("=====================================================")
    print(" Сервер AilurusGIS запущен!")
    print(" Лендинг: http://localhost:50010/")
    print(" Карта:   http://localhost:50010/map")
    print(" Статистика: http://localhost:50010/api/analytics/stats")
    print("=====================================================")
    app.run(host="0.0.0.0", port=50010, debug=False, use_reloader=False, threaded=True)