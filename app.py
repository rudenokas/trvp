from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import uuid
from datetime import datetime
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ========== КОНФИГУРАЦИЯ БАЗЫ ДАННЫХ ==========
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'aviacompany_db'
}


def get_db_connection():
    """Создает соединение с базой данных"""
    try:
        connection = mysql.connector.connect(
            host=DB_CONFIG['host'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
            autocommit=False
        )
        logger.debug("Подключение к базе данных успешно")
        return connection
    except Error as e:
        logger.error(f"Ошибка подключения к базе данных: {e}")
        return None



# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

def format_datetime(dt):
    """Форматирует datetime для JSON"""
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt


# ========== API ДЛЯ САМОЛЕТОВ ==========

@app.route('/api/airplanes', methods=['GET'])
def get_airplanes():
    """Получить все самолеты"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, name, capacity FROM airplanes ORDER BY name")
        airplanes = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify(airplanes)
    except Exception as e:
        logger.error(f"Ошибка получения самолетов: {e}")
        return jsonify({'error': str(e)}), 500


# ========== API ДЛЯ РЕЙСОВ ==========

@app.route('/api/flights', methods=['GET'])
def get_flights():
    """Получить все рейсы с информацией о свободных местах"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        cursor.execute('''
            SELECT 
                f.id,
                f.departure_datetime,
                f.destination,
                f.airplane_id,
                a.name as airplane_name,
                a.capacity,
                COUNT(b.id) as bookings_count,
                a.capacity - COUNT(b.id) as available_seats
            FROM flights f
            JOIN airplanes a ON f.airplane_id = a.id
            LEFT JOIN bookings b ON f.id = b.flight_id
            GROUP BY f.id
            ORDER BY f.departure_datetime DESC
        ''')

        flights = cursor.fetchall()

        # Форматируем даты
        for flight in flights:
            flight['departure_datetime'] = format_datetime(flight['departure_datetime'])
            flight['airplane'] = {
                'id': flight['airplane_id'],
                'name': flight['airplane_name'],
                'capacity': flight['capacity']
            }

        cursor.close()
        connection.close()

        return jsonify(flights)
    except Exception as e:
        logger.error(f"Ошибка получения рейсов: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/flights', methods=['POST'])
def create_flight():
    """Создать новый рейс"""
    try:
        data = request.get_json()

        # Валидация
        if not data.get('departure_datetime'):
            return jsonify({'error': 'Дата вылета обязательна'}), 400
        if not data.get('destination'):
            return jsonify({'error': 'Пункт назначения обязателен'}), 400
        if not data.get('airplane_id'):
            return jsonify({'error': 'Самолет обязателен'}), 400

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Проверяем самолет
        cursor.execute("SELECT id FROM airplanes WHERE id = %s", (data['airplane_id'],))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Самолет не найден'}), 404

        # Проверяем уникальность рейса
        cursor.execute(
            "SELECT id FROM flights WHERE departure_datetime = %s AND destination = %s",
            (data['departure_datetime'], data['destination'])
        )
        if cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Рейс с такой датой и направлением уже существует'}), 400

        # Создаем рейс
        flight_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO flights (id, departure_datetime, destination, airplane_id) VALUES (%s, %s, %s, %s)",
            (flight_id, data['departure_datetime'], data['destination'], data['airplane_id'])
        )

        connection.commit()

        cursor.close()
        connection.close()

        return jsonify({'id': flight_id, 'message': 'Рейс создан'}), 201

    except Exception as e:
        logger.error(f"Ошибка создания рейса: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/flights/<flight_id>', methods=['PUT'])
def update_flight(flight_id):
    """Обновить рейс"""
    try:
        data = request.get_json()

        # Валидация
        if not data.get('departure_datetime'):
            return jsonify({'error': 'Дата вылета обязательна'}), 400
        if not data.get('destination'):
            return jsonify({'error': 'Пункт назначения обязателен'}), 400
        if not data.get('airplane_id'):
            return jsonify({'error': 'Самолет обязателен'}), 400

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Проверяем существование рейса
        cursor.execute("SELECT id FROM flights WHERE id = %s", (flight_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Рейс не найден'}), 404

        # Проверяем самолет
        cursor.execute("SELECT id FROM airplanes WHERE id = %s", (data['airplane_id'],))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Самолет не найден'}), 404

        # Проверяем уникальность (кроме текущего рейса)
        cursor.execute(
            "SELECT id FROM flights WHERE departure_datetime = %s AND destination = %s AND id != %s",
            (data['departure_datetime'], data['destination'], flight_id)
        )
        if cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Другой рейс с такой датой и направлением уже существует'}), 400

        # Обновляем рейс
        cursor.execute(
            "UPDATE flights SET departure_datetime = %s, destination = %s, airplane_id = %s WHERE id = %s",
            (data['departure_datetime'], data['destination'], data['airplane_id'], flight_id)
        )

        connection.commit()

        cursor.close()
        connection.close()

        return jsonify({'message': 'Рейс обновлен'})

    except Exception as e:
        logger.error(f"Ошибка обновления рейса: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/flights/<flight_id>', methods=['DELETE'])
def delete_flight(flight_id):
    """Удалить рейс"""
    connection = None
    cursor = None

    try:
        logger.info(f"Запрос на удаление рейса: {flight_id}")

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Проверяем существование рейса
        cursor.execute("SELECT id FROM flights WHERE id = %s", (flight_id,))
        flight = cursor.fetchone()

        if not flight:
            logger.warning(f"Рейс {flight_id} не найден")
            return jsonify({'error': 'Рейс не найден'}), 404

        # Проверяем, есть ли брони на рейсе
        cursor.execute("SELECT COUNT(*) as count FROM bookings WHERE flight_id = %s", (flight_id,))
        result = cursor.fetchone()
        bookings_count = result['count']

        logger.info(f"Рейс {flight_id} имеет {bookings_count} броней")

        if bookings_count > 0:
            # Если есть брони, получаем информацию о них для сообщения
            cursor.execute("SELECT passenger_name FROM bookings WHERE flight_id = %s LIMIT 5", (flight_id,))
            bookings = cursor.fetchall()
            passenger_names = [b['passenger_name'] for b in bookings]

            message = f'Нельзя удалить рейс, на который есть брони ({bookings_count} броней)'
            if passenger_names:
                message += f'. Пассажиры: {", ".join(passenger_names)}'
                if bookings_count > 5:
                    message += f' и еще {bookings_count - 5} других'

            return jsonify({'error': message}), 400

        # Удаляем рейс (каскадно удалятся все связанные брони)
        cursor.execute("DELETE FROM flights WHERE id = %s", (flight_id,))

        if cursor.rowcount == 0:
            return jsonify({'error': 'Не удалось удалить рейс'}), 500

        connection.commit()

        logger.info(f"Рейс {flight_id} успешно удален")
        return jsonify({'message': 'Рейс успешно удален'})

    except Exception as e:
        logger.error(f"Ошибка удаления рейса {flight_id}: {e}")
        if connection and connection.is_connected():
            connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# ========== API ДЛЯ БРОНИРОВАНИЙ ==========

@app.route('/api/flights/<flight_id>/bookings', methods=['GET'])
def get_flight_bookings(flight_id):
    """Получить все брони для рейса"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Проверяем существование рейса
        cursor.execute("SELECT id FROM flights WHERE id = %s", (flight_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Рейс не найден'}), 404

        cursor.execute(
            "SELECT id, passenger_name, flight_id FROM bookings WHERE flight_id = %s ORDER BY passenger_name",
            (flight_id,)
        )
        bookings = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify(bookings)
    except Exception as e:
        logger.error(f"Ошибка получения броней: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/flights/<flight_id>/bookings', methods=['POST'])
def create_booking(flight_id):
    """Создать бронь на рейс"""
    try:
        data = request.get_json()

        # Валидация
        passenger_name = data.get('passenger_name', '').strip()
        if not passenger_name:
            return jsonify({'error': 'ФИО пассажира обязательно'}), 400

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Проверяем существование рейса и получаем информацию
        cursor.execute('''
            SELECT 
                f.id,
                f.departure_datetime,
                f.destination,
                a.capacity
            FROM flights f
            JOIN airplanes a ON f.airplane_id = a.id
            WHERE f.id = %s
        ''', (flight_id,))

        flight = cursor.fetchone()
        if not flight:
            cursor.close()
            connection.close()
            return jsonify({'error': 'Рейс не найден'}), 404

        # Проверяем количество броней на рейсе
        cursor.execute("SELECT COUNT(*) as count FROM bookings WHERE flight_id = %s", (flight_id,))
        bookings_count = cursor.fetchone()['count']

        if bookings_count >= flight['capacity']:
            cursor.close()
            connection.close()
            return jsonify({'error': 'На рейсе нет свободных мест'}), 400

        # Проверяем, нет ли уже брони этого пассажира на этот рейс
        cursor.execute(
            "SELECT id FROM bookings WHERE passenger_name = %s AND flight_id = %s",
            (passenger_name, flight_id)
        )
        if cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Пассажир уже имеет бронь на этот рейс'}), 400

        # Проверяем, нет ли у пассажира брони на другой рейс в это же время
        cursor.execute('''
            SELECT b.id 
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            WHERE b.passenger_name = %s AND f.departure_datetime = %s
        ''', (passenger_name, flight['departure_datetime']))

        if cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({'error': 'Пассажир уже имеет бронь на другой рейс в это же время'}), 400

        # Создаем бронь
        booking_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO bookings (id, passenger_name, flight_id) VALUES (%s, %s, %s)",
            (booking_id, passenger_name, flight_id)
        )

        connection.commit()

        cursor.close()
        connection.close()

        return jsonify({'id': booking_id, 'message': 'Бронь создана'}), 201

    except Exception as e:
        logger.error(f"Ошибка создания брони: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/bookings/<booking_id>', methods=['DELETE'])
def delete_booking(booking_id):
    """Удалить бронь"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor()

        # Удаляем бронь
        cursor.execute("DELETE FROM bookings WHERE id = %s", (booking_id,))

        if cursor.rowcount == 0:
            cursor.close()
            connection.close()
            return jsonify({'error': 'Бронь не найдена'}), 404

        connection.commit()

        cursor.close()
        connection.close()

        return jsonify({'message': 'Бронь удалена'})

    except Exception as e:
        logger.error(f"Ошибка удаления брони: {e}")
        return jsonify({'error': str(e)}), 500


# ========== API ДЛЯ ПЕРЕНОСА БРОНИ ==========

@app.route('/api/flights/<flight_id>/available-transfer', methods=['GET'])
def get_available_transfer_flights(flight_id):
    """Получить рейсы для переноса брони"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # Получаем информацию о текущем рейсе
        cursor.execute('''
            SELECT destination, departure_datetime 
            FROM flights 
            WHERE id = %s
        ''', (flight_id,))

        current_flight = cursor.fetchone()
        if not current_flight:
            cursor.close()
            connection.close()
            return jsonify({'error': 'Текущий рейс не найден'}), 404

        destination = current_flight['destination']
        current_departure = current_flight['departure_datetime']

        # Получаем все рейсы с тем же пунктом назначения, кроме текущего
        cursor.execute('''
            SELECT 
                f.id,
                f.departure_datetime,
                f.destination,
                a.name as airplane_name,
                a.capacity,
                COUNT(b.id) as bookings_count,
                a.capacity - COUNT(b.id) as available_seats
            FROM flights f
            JOIN airplanes a ON f.airplane_id = a.id
            LEFT JOIN bookings b ON f.id = b.flight_id
            WHERE f.destination = %s 
            AND f.id != %s
            GROUP BY f.id
            HAVING available_seats > 0
            ORDER BY f.departure_datetime
        ''', (destination, flight_id))

        available_flights = cursor.fetchall()

        # Форматируем даты
        for flight in available_flights:
            flight['departure_datetime'] = format_datetime(flight['departure_datetime'])

        cursor.close()
        connection.close()

        return jsonify(available_flights)

    except Exception as e:
        logger.error(f"Ошибка получения рейсов для переноса: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/bookings/<booking_id>/transfer', methods=['POST'])
def transfer_booking(booking_id):
    """Перенести бронь на другой рейс"""
    connection = None
    cursor = None

    try:
        data = request.get_json()
        logger.info(f"Перенос брони {booking_id}: {data}")

        if not data.get('new_flight_id'):
            return jsonify({'error': 'ID нового рейса обязателен'}), 400

        new_flight_id = data['new_flight_id']

        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Нет подключения к базе данных'}), 500

        cursor = connection.cursor(dictionary=True)

        # 1. Получаем информацию о текущей брони
        cursor.execute('''
            SELECT 
                b.id,
                b.passenger_name,
                b.flight_id as current_flight_id,
                f.destination as current_destination,
                f.departure_datetime as current_departure
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            WHERE b.id = %s
        ''', (booking_id,))

        current_booking = cursor.fetchone()
        if not current_booking:
            raise Exception('Бронь не найдена')

        passenger_name = current_booking['passenger_name']
        current_flight_id = current_booking['current_flight_id']
        current_destination = current_booking['current_destination']
        current_departure = current_booking['current_departure']

        logger.info(f"Перенос брони пассажира {passenger_name} с рейса {current_flight_id} на рейс {new_flight_id}")

        # 2. Проверяем новый рейс
        cursor.execute('''
            SELECT 
                f.id,
                f.destination,
                f.departure_datetime,
                a.capacity
            FROM flights f
            JOIN airplanes a ON f.airplane_id = a.id
            WHERE f.id = %s
        ''', (new_flight_id,))

        new_flight = cursor.fetchone()
        if not new_flight:
            raise Exception('Новый рейс не найден')

        new_destination = new_flight['destination']
        new_departure = new_flight['departure_datetime']

        # 3. Проверяем условия переноса

        # а) Тот же пункт назначения
        if current_destination != new_destination:
            return jsonify({
                'error': f'Нельзя перенести бронь на рейс с другим пунктом назначения. Текущее: {current_destination}, Новое: {new_destination}'
            }), 400

        # б) Проверяем свободные места на новом рейсе
        cursor.execute("SELECT COUNT(*) as count FROM bookings WHERE flight_id = %s", (new_flight_id,))
        new_flight_bookings = cursor.fetchone()['count']

        if new_flight_bookings >= new_flight['capacity']:
            return jsonify({'error': 'На новом рейсе нет свободных мест'}), 400

        # в) Проверяем, нет ли уже брони этого пассажира на новом рейсе
        cursor.execute(
            "SELECT id FROM bookings WHERE passenger_name = %s AND flight_id = %s",
            (passenger_name, new_flight_id)
        )
        if cursor.fetchone():
            return jsonify({'error': 'Пассажир уже имеет бронь на новом рейсе'}), 400

        # г) Проверяем, нет ли конфликта по времени
        cursor.execute('''
            SELECT b.id 
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            WHERE b.passenger_name = %s 
            AND f.departure_datetime = %s
            AND b.flight_id != %s
        ''', (passenger_name, new_departure, current_flight_id))

        if cursor.fetchone():
            return jsonify({'error': 'Пассажир уже имеет бронь на другой рейс в это же время'}), 400

        # 4. Выполняем перенос
        cursor.execute(
            "UPDATE bookings SET flight_id = %s WHERE id = %s",
            (new_flight_id, booking_id)
        )

        if cursor.rowcount == 0:
            raise Exception('Не удалось обновить бронь')

        connection.commit()

        logger.info(f"Бронь {booking_id} успешно перенесена с рейса {current_flight_id} на рейс {new_flight_id}")

        return jsonify({
            'message': 'Бронь успешно перенесена',
            'old_flight_id': current_flight_id,
            'new_flight_id': new_flight_id,
            'passenger_name': passenger_name
        })

    except Exception as e:
        logger.error(f"Ошибка переноса брони: {e}")
        if connection and connection.is_connected():
            connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# ========== СТАТУС СИСТЕМЫ ==========

@app.route('/api/status', methods=['GET'])
def get_status():
    """Получить статус системы"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({
                'status': 'error',
                'database': 'disconnected'
            }), 500

        cursor = connection.cursor(dictionary=True)

        # Получаем статистику
        cursor.execute("SELECT COUNT(*) as airplanes_count FROM airplanes")
        airplanes = cursor.fetchone()

        cursor.execute("SELECT COUNT(*) as flights_count FROM flights")
        flights = cursor.fetchone()

        cursor.execute("SELECT COUNT(*) as bookings_count FROM bookings")
        bookings = cursor.fetchone()

        cursor.close()
        connection.close()

        return jsonify({
            'status': 'ok',
            'database': 'connected',
            'stats': {
                'airplanes_count': airplanes['airplanes_count'],
                'flights_count': flights['flights_count'],
                'bookings_count': bookings['bookings_count']
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


# ========== ВЕБ-ИНТЕРФЕЙС ==========

@app.route('/')
def index():
    """Главная страница"""
    return render_template('index.html')


# ========== ЗАПУСК ПРИЛОЖЕНИЯ ==========

if __name__ == '__main__':
    print("=" * 60)
    print("АВИАКОМПАНИЯ - СИСТЕМА УПРАВЛЕНИЯ РЕЙСАМИ")
    print("=" * 60)

    try:
        print("✓ База данных инициализирована")
    except Exception as e:
        print(f"✗ Ошибка инициализации: {e}")

    print("=" * 60)
    print("Сервер запущен: http://localhost:5000")
    #print("API доступен: http://localhost:5000/api/")
    print("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=5000)