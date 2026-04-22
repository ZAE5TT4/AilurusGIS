import os
import sqlite3
import time
import hashlib
import json
import uuid
from urllib.request import Request, urlopen
from flask import Blueprint, jsonify, request

analytics_bp = Blueprint('analytics', __name__)

# Путь к БД: так как скрипт в PythonFiles/, поднимаемся на уровень выше в папку DB/
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'DB')
ANALYTICS_DB_PATH = os.path.join(DB_DIR, 'analytics.db')

# Кэш для GeoIP
_GEOIP_CACHE = {}
_GEOIP_CACHE_TTL = 3600  # 1 час


def init_analytics_db():
    """Инициализация реляционной базы данных для аналитики."""
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR)

    conn = sqlite3.connect(ANALYTICS_DB_PATH)
    cursor = conn.cursor()

    # 1. Таблица уникальных посетителей (ID — хэш от IP и UA)
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

    # 2. Таблица сессий (группирует визиты и действия)
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

    # 3. Таблица просмотров страниц (Лендинг, Карта и т.д.)
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


def get_ip(req):
    """Извлекает реальный IP, даже если мы за прокси."""
    ip = req.headers.get('X-Forwarded-For', req.remote_addr)
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    return ip


def get_region_by_ip(ip):
    """Определяет страну и город по IP."""
    if not ip or ip in ('127.0.0.1', '::1', 'Unknown'):
        return 'Local', 'Local'

    now = time.time()
    cached = _GEOIP_CACHE.get(ip)
    if cached and now - cached['ts'] < _GEOIP_CACHE_TTL:
        return cached['country'], cached['city']

    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,city&lang=ru"
        req = Request(url, headers={"User-Agent": "AilurusGIS/Analytics"})
        with urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
        if data.get('status') == 'success':
            country = data.get('country', 'Unknown')
            city    = data.get('city', 'Unknown')
        else:
            country, city = 'Unknown', 'Unknown'
    except Exception:
        country, city = 'Unknown', 'Unknown'

    _GEOIP_CACHE[ip] = {'ts': now, 'country': country, 'city': city}
    return country, city


def make_visitor_fingerprint(ip, user_agent):
    """Создаёт уникальный ID посетителя без кукисов."""
    raw = f"{ip}|{user_agent}"
    # Используем SHA-256 для создания надежного текстового ID
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def get_active_session(cursor, visitor_id):
    """Ищет сессию, которая была активна менее 30 минут назад."""
    cursor.execute('''
        SELECT session_id FROM sessions 
        WHERE visitor_id = ? AND end_time >= datetime('now', '-30 minutes')
        ORDER BY end_time DESC LIMIT 1
    ''', (visitor_id,))
    row = cursor.fetchone()
    return row[0] if row else None


def log_page_view(page_name, req):
    """Главная функция: записывает просмотр страницы и обновляет сессию."""
    try:
        ip = get_ip(req)
        ua = req.headers.get('User-Agent', 'Unknown')
        ref = req.referrer or 'Direct'
        
        visitor_id = make_visitor_fingerprint(ip, ua)
        country, city = get_region_by_ip(ip)

        conn = sqlite3.connect(ANALYTICS_DB_PATH)
        cursor = conn.cursor()

        # 1. Обновляем/добавляем пользователя (UPSERT)
        cursor.execute('''
            INSERT INTO visitors (visitor_id, ip_address, user_agent, country, city)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(visitor_id) DO NOTHING
        ''', (visitor_id, ip, ua, country, city))

        # 2. Управление сессией
        session_id = get_active_session(cursor, visitor_id)
        if session_id:
            # Продлеваем текущую сессию
            cursor.execute('UPDATE sessions SET end_time = CURRENT_TIMESTAMP WHERE session_id = ?', (session_id,))
        else:
            # Создаем новую сессию
            session_id = str(uuid.uuid4())
            cursor.execute('''
                INSERT INTO sessions (session_id, visitor_id, referrer)
                VALUES (?, ?, ?)
            ''', (session_id, visitor_id, ref))

        # 3. Запись просмотра страницы
        view_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO page_views (view_id, session_id, page_name)
            VALUES (?, ?, ?)
        ''', (view_id, session_id, page_name))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Ошибка записи page_view: {e}")


# --- API ЭНДПОИНТЫ ДЛЯ ФРОНТЕНДА И АДМИНКИ ---

@analytics_bp.route('/api/analytics/stats', methods=['GET'])
def get_stats():
    """Сбор базовой аналитики через JOIN запросы."""
    try:
        conn = sqlite3.connect(ANALYTICS_DB_PATH)
        cursor = conn.cursor()

        # Всего уникальных посетителей
        cursor.execute("SELECT COUNT(*) FROM visitors")
        total_visitors = cursor.fetchone()[0]

        # Средняя продолжительность сессии (в минутах)
        cursor.execute('''
            SELECT AVG((julianday(end_time) - julianday(start_time)) * 1440) 
            FROM sessions WHERE end_time > start_time
        ''')
        avg_session_min = cursor.fetchone()[0] or 0

        # Популярные страницы
        cursor.execute('''
            SELECT page_name, COUNT(*) FROM page_views 
            GROUP BY page_name ORDER BY COUNT(*) DESC
        ''')
        pages = dict(cursor.fetchall())

        # География посетителей (топ 10)
        cursor.execute('''
            SELECT country, city, COUNT(*) as cnt
            FROM visitors
            WHERE country != 'Unknown'
            GROUP BY country, city
            ORDER BY cnt DESC LIMIT 10
        ''')
        regions = [{"country": r[0], "city": r[1], "visitors": r[2]} for r in cursor.fetchall()]

        conn.close()
        return jsonify({
            "status": "success",
            "total_visitors": total_visitors,
            "avg_session_duration_minutes": round(avg_session_min, 2),
            "page_views": pages,
            "top_regions": regions
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500