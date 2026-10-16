import sqlite3
import os
from flask import Blueprint, jsonify, request

#store user markers
poi_bp = Blueprint('poi', __name__)

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'DB')
DB_PATH = os.path.join(DB_DIR, 'user_pois.db')

def init_db():
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pois (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_token TEXT NOT NULL DEFAULT 'legacy',
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    try:
        cursor.execute("ALTER TABLE pois ADD COLUMN user_token TEXT NOT NULL DEFAULT 'legacy'")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()
init_db()

def get_user_token():
    """Получает токен пользователя из заголовка запроса."""
    token = request.headers.get('X-User-Token', '').strip()
    if not token or len(token) < 8:
        return None
    return token
@poi_bp.route('/api/poi', methods=['GET'])

def get_pois():
    token = get_user_token()
    if not token:
        return jsonify({"error": "Токен пользователя не указан или недействителен"}), 401
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, lat, lon, text FROM pois WHERE user_token = ?', (token,))
        pois = [{"id": r[0], "lat": r[1], "lon": r[2], "text": r[3]} for r in cursor.fetchall()]
        return jsonify(pois)
    except Exception as e:
        return jsonify({"error": "Ошибка чтения закладок"}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
@poi_bp.route('/api/poi', methods=['POST'])

def add_poi():
    token = get_user_token()
    if not token:
        return jsonify({"error": "Токен пользователя не указан или недействителен"}), 401
    data = request.json
    if not data:
        return jsonify({"error": "Пустое тело запроса"}), 400
    lat = data.get('lat')
    lon = data.get('lon')
    text = data.get('text', 'Без названия')
    if lat is None or lon is None:
        return jsonify({"error": "lat и lon обязательны"}), 400
    try:
        lat = float(lat)
        lon = float(lon)
    except (ValueError, TypeError):
        return jsonify({"error": "lat и lon должны быть числами"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "Координаты вне допустимого диапазона"}), 400
    if not isinstance(text, str):
        text = str(text)
    if len(text) > 500:
        text = text[:500]
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO pois (user_token, lat, lon, text) VALUES (?, ?, ?, ?)',
            (token, lat, lon, text)
        )
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({"id": new_id, "lat": lat, "lon": lon, "text": text}), 201
    except Exception as e:
        return jsonify({"error": "Ошибка сохранения метки"}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
@poi_bp.route('/api/poi/<int:poi_id>', methods=['DELETE'])

def delete_poi(poi_id):
    token = get_user_token()
    if not token:
        return jsonify({"error": "Токен пользователя не указан или недействителен"}), 401
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM pois WHERE id = ? AND user_token = ?', (poi_id, token))
        deleted = cursor.rowcount
        conn.commit()
        if deleted == 0:
            return jsonify({"error": "Метка не найдена или доступ запрещён"}), 404
        return jsonify({"status": "deleted", "id": poi_id})
    except Exception as e:
        return jsonify({"error": "Ошибка удаления метки"}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
