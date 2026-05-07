import os
import sqlite3
import time
import hashlib
import json
import uuid
from urllib.request import Request, urlopen
from flask import Blueprint, jsonify, request

analytics_bp = Blueprint('analytics', __name__)

# путь к бд: так как скрипт в pythonfiles/ поднимаемся на уровень выше в папку db/
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'DB')
ANALYTICS_DB_PATH = os.path.join(DB_DIR, 'analytics.db')

# кэш для geoip
_GEOIP_CACHE = {}
_GEOIP_CACHE_TTL = 3600  # 1 час

# ключ доступа к статистике (загружается из переменной окружения)
ANALYTICS_API_KEY = os.environ.get('ANALYTICS_API_KEY', '')


# объявление функции
def init_analytics_db():
    """Инициализация реляционной базы данных для аналитики."""
    # проверка условия
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR)

    conn = sqlite3.connect(ANALYTICS_DB_PATH)
    cursor = conn.cursor()

    # 1 таблица уникальных посетителей (id хэш от ip и ua)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS visitors (
            visitor_id TEXT PRIMARY KEY,
            ip_address TEXT,
            user_agent TEXT,
            country TEXT,
            city TEXT,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2 таблица сессий (группирует визиты и действия)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            visitor_id TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            referrer TEXT,
            FOREIGN KEY(visitor_id) REFERENCES visitors(visitor_id)
        )
    ''')

    # 3 таблица просмотров страниц (лендинг карта и тд)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS page_views (
            view_id TEXT PRIMARY KEY,
            session_id TEXT,
            page_name TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(session_id)
        )
    ''')

    conn.commit()
    conn.close()

init_analytics_db()


# объявление функции
def get_ip(req):
    """Извлекает реальный IP, даже если мы за прокси."""
    ip = req.headers.get('X-Forwarded-For', req.remote_addr)
    # проверка условия
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    # возврат результата
    return ip


# объявление функции
def get_region_by_ip(ip):
    """Определяет страну и город по IP."""
    # проверка условия
    if not ip or ip in ('127.0.0.1', '::1', 'Unknown'):
        # возврат результата
        return 'Local', 'Local'

    now = time.time()
    cached = _GEOIP_CACHE.get(ip)
    # проверка условия
    if cached and now - cached['ts'] < _GEOIP_CACHE_TTL:
        # возврат результата
        return cached['country'], cached['city']

    # начало блока перехвата ошибок
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,city&lang=ru"
        req = Request(url, headers={"User-Agent": "AilurusGIS/Analytics"})
        with urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
        # проверка условия
        if data.get('status') == 'success':
            country = data.get('country', 'Unknown')
            city    = data.get('city', 'Unknown')
        else:
            country, city = 'Unknown', 'Unknown'
    # обработка ошибки
    except Exception:
        country, city = 'Unknown', 'Unknown'

    _GEOIP_CACHE[ip] = {'ts': now, 'country': country, 'city': city}
    # возврат результата
    return country, city


# объявление функции
def make_visitor_fingerprint(ip, user_agent):
    """Создаёт уникальный ID посетителя без кукисов."""
    raw = f"{ip}|{user_agent}"
    # используем sha256 для создания надежного текстового id
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


# объявление функции
def get_active_session(cursor, visitor_id):
    """Ищет сессию, которая была активна менее 30 минут назад."""
    cursor.execute('''
        SELECT session_id FROM sessions 
        WHERE visitor_id = ? AND end_time >= datetime('now', '-30 minutes')
        ORDER BY end_time DESC LIMIT 1
    ''', (visitor_id,))
    row = cursor.fetchone()
    # возврат результата
    return row[0] if row else None


# объявление функции
def log_page_view(page_name, req):
    """Главная функция: записывает просмотр страницы и обновляет сессию."""
    conn = None
    # начало блока перехвата ошибок
    try:
        ip = get_ip(req)
        ua = req.headers.get('User-Agent', 'Unknown')
        ref = req.referrer or 'Direct'
        
        visitor_id = make_visitor_fingerprint(ip, ua)
        country, city = get_region_by_ip(ip)

        conn = sqlite3.connect(ANALYTICS_DB_PATH)
        cursor = conn.cursor()

        # 1 обновляем/добавляем пользователя (upsert)
        cursor.execute('''
            INSERT INTO visitors (visitor_id, ip_address, user_agent, country, city)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(visitor_id) DO NOTHING
        ''', (visitor_id, ip, ua, country, city))

        # 2 управление сессией
        session_id = get_active_session(cursor, visitor_id)
        # проверка условия
        if session_id:
            # продлеваем текущую сессию
            cursor.execute('UPDATE sessions SET end_time = CURRENT_TIMESTAMP WHERE session_id = ?', (session_id,))
        else:
            # создаем новую сессию
            session_id = str(uuid.uuid4())
            cursor.execute('''
                INSERT INTO sessions (session_id, visitor_id, referrer)
                VALUES (?, ?, ?)
            ''', (session_id, visitor_id, ref))

        # 3 запись просмотра страницы
        view_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO page_views (view_id, session_id, page_name)
            VALUES (?, ?, ?)
        ''', (view_id, session_id, page_name))

        conn.commit()
    # обработка ошибки
    except Exception as e:
        print(f"Ошибка записи page_view: {e}")
    finally:
        # гарантированное закрытие соединения с базой
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# api эндпоинты для фронтенда и админки

@analytics_bp.route('/api/analytics/stats', methods=['GET'])
# объявление функции
def get_stats():
    """Сбор базовой аналитики через JOIN запросы."""
    # защита эндпоинта статистики ключом доступа
    if ANALYTICS_API_KEY:
        provided_key = request.args.get('key', '') or request.headers.get('X-Analytics-Key', '')
        if provided_key != ANALYTICS_API_KEY:
            return jsonify({"status": "error", "message": "Доступ запрещён"}), 403
    conn = None
    # начало блока перехвата ошибок
    try:
        conn = sqlite3.connect(ANALYTICS_DB_PATH)
        cursor = conn.cursor()

        # всего уникальных посетителей
        cursor.execute("SELECT COUNT(*) FROM visitors")
        total_visitors = cursor.fetchone()[0]

        # средняя продолжительность сессии (в минутах)
        cursor.execute('''
            SELECT AVG((julianday(end_time) - julianday(start_time)) * 1440) 
            FROM sessions WHERE end_time > start_time
        ''')
        avg_session_min = cursor.fetchone()[0] or 0

        # популярные страницы
        cursor.execute('''
            SELECT page_name, COUNT(*) FROM page_views 
            GROUP BY page_name ORDER BY COUNT(*) DESC
        ''')
        pages = dict(cursor.fetchall())

        # география посетителей (топ 10)
        cursor.execute('''
            SELECT country, city, COUNT(*) as cnt
            FROM visitors
            WHERE country != 'Unknown'
            GROUP BY country, city
            ORDER BY cnt DESC LIMIT 10
        ''')
        regions = [{"country": r[0], "city": r[1], "visitors": r[2]} for r in cursor.fetchall()]

        conn.close()
        # возврат результата
        return jsonify({
            "status": "success",
            "total_visitors": total_visitors,
            "avg_session_duration_minutes": round(avg_session_min, 2),
            "page_views": pages,
            "top_regions": regions
        })
    # обработка ошибки
    except Exception as e:
        # возврат результата
        return jsonify({"status": "error", "message": "Ошибка сбора статистики"}), 500
    finally:
        # гарантированное закрытие соединения
        if conn:
            try:
                conn.close()
            except Exception:
                pass