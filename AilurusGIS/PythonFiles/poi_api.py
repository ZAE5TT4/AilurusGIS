import sqlite3
import os
from flask import Blueprint, jsonify, request

poi_bp = Blueprint('poi', __name__)

# ИСПРАВЛЕНО: путь к БД теперь DB/ (рядом с server.py), а не GeoData/DB/
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
    # Добавляем колонку user_token если её ещё нет (миграция старой БД)
    try:
        cursor.execute("ALTER TABLE pois ADD COLUMN user_token TEXT NOT NULL DEFAULT 'legacy'")
    except sqlite3.OperationalError:
        pass  # Колонка уже существует — всё хорошо
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

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT id, lat, lon, text FROM pois WHERE user_token = ?', (token,))
    pois = [{"id": r[0], "lat": r[1], "lon": r[2], "text": r[3]} for r in cursor.fetchall()]
    conn.close()
    return jsonify(pois)


@poi_bp.route('/api/poi', methods=['POST'])
def add_poi():
    token = get_user_token()
    if not token:
        return jsonify({"error": "Токен пользователя не указан или недействителен"}), 401

    data = request.json
    lat = data.get('lat')
    lon = data.get('lon')
    text = data.get('text', 'Без названия')

    if lat is None or lon is None:
        return jsonify({"error": "lat и lon обязательны"}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO pois (user_token, lat, lon, text) VALUES (?, ?, ?, ?)',
        (token, lat, lon, text)
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"id": new_id, "lat": lat, "lon": lon, "text": text}), 201


@poi_bp.route('/api/poi/<int:poi_id>', methods=['DELETE'])
def delete_poi(poi_id):
    token = get_user_token()
    if not token:
        return jsonify({"error": "Токен пользователя не указан или недействителен"}), 401

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Удаляем только если метка принадлежит этому пользователю
    cursor.execute('DELETE FROM pois WHERE id = ? AND user_token = ?', (poi_id, token))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()

    if deleted == 0:
        return jsonify({"error": "Метка не найдена или доступ запрещён"}), 404

    return jsonify({"status": "deleted", "id": poi_id})
