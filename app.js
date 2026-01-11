// Глобальные переменные
let currentFlightId = null;
let currentBookingId = null;
let airplanes = [];
let flights = [];

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Приложение загружено');
    await loadInitialData();
    setupEventListeners();
});

// Загрузка данных
async function loadInitialData() {
    showLoading(true);
    try {
        await Promise.all([
            loadAirplanes(),
            loadFlights()
        ]);
        showMessage('Данные загружены', 'success');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showMessage('Ошибка загрузки данных', 'danger');
    } finally {
        showLoading(false);
    }
}

async function loadAirplanes() {
    try {
        const response = await fetch('/api/airplanes');
        if (!response.ok) throw new Error('Ошибка загрузки самолетов');
        airplanes = await response.json();
        populateAirplaneSelect();
        renderAirplanes();
        return airplanes;
    } catch (error) {
        console.error('Ошибка загрузки самолетов:', error);
        throw error;
    }
}

async function loadFlights() {
    try {
        const response = await fetch('/api/flights');
        if (!response.ok) throw new Error('Ошибка загрузки рейсов');
        flights = await response.json();
        renderFlights();
        updateFilters();
        updateStats();
        return flights;
    } catch (error) {
        console.error('Ошибка загрузки рейсов:', error);
        throw error;
    }
}

async function loadBookings(flightId) {
    try {
        const response = await fetch(`/api/flights/${flightId}/bookings`);
        if (!response.ok) throw new Error('Ошибка загрузки броней');
        return await response.json();
    } catch (error) {
        console.error('Ошибка загрузки броней:', error);
        throw error;
    }
}

async function loadAvailableFlightsForTransfer(flightId) {
    try {
        const response = await fetch(`/api/flights/${flightId}/available-transfer`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка загрузки рейсов для переноса');
        }
        return await response.json();
    } catch (error) {
        console.error('Ошибка загрузки рейсов для переноса:', error);
        throw error;
    }
}

// Рендеринг
function renderFlights() {
    const container = document.getElementById('flightsContainer');
    if (!container) return;

    if (flights.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-airplane" style="font-size: 3rem; color: #6c757d;"></i>
                <h4 class="mt-3">Рейсов нет</h4>
                <p class="text-muted">Добавьте первый рейс</p>
            </div>
        `;
        return;
    }

    let html = '<div class="row">';

    flights.forEach(flight => {
        const date = new Date(flight.departure_datetime);
        const formattedDate = date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const isFull = flight.available_seats <= 0;
        const badgeClass = isFull ? 'bg-danger' : 'bg-success';
        const badgeText = isFull ? 'Заполнен' : 'Есть места';

        html += `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">
                            <i class="bi bi-geo-alt text-primary"></i>
                            ${flight.destination}
                        </h5>
                        <h6 class="card-subtitle mb-2 text-muted">
                            <i class="bi bi-clock"></i> ${formattedDate}
                        </h6>
                        <p class="card-text">
                            <i class="bi bi-airplane"></i> ${flight.airplane.name}
                            <br><small>Вместимость: ${flight.airplane.capacity} мест</small>
                        </p>

                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                <span class="badge ${badgeClass}">${badgeText}</span>
                                <span class="badge bg-info ms-1">Свободно: ${flight.available_seats}</span>
                            </div>
                            <span class="badge bg-secondary">Броней: ${flight.bookings_count}</span>
                        </div>

                        <div class="btn-group w-100">
                            <button class="btn btn-outline-primary btn-sm"
                                    onclick="showBookings('${flight.id}', '${flight.destination}')">
                                <i class="bi bi-ticket"></i> Брони
                            </button>
                            <button class="btn btn-outline-warning btn-sm" onclick="editFlight('${flight.id}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteFlightConfirm('${flight.id}', '${flight.destination}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

function renderAirplanes() {
    const table = document.getElementById('airplanesTable');
    if (!table) return;

    if (airplanes.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">Нет данных</td>
            </tr>
        `;
        return;
    }

    let html = '';
    airplanes.forEach(airplane => {
        html += `
            <tr>
                <td><small>${airplane.id.substring(0, 8)}...</small></td>
                <td>${airplane.name}</td>
                <td><span class="badge bg-info">${airplane.capacity} мест</span></td>
                <td><span class="badge bg-success">Доступен</span></td>
            </tr>
        `;
    });

    table.innerHTML = html;
}

// Работа с бронями
async function showBookings(flightId, destination) {
    currentFlightId = flightId;

    try {
        // Устанавливаем информацию о рейсе
        document.getElementById('currentFlightInfo').textContent = destination;
        document.getElementById('flightIdDisplay').textContent = flightId.substring(0, 8) + '...';

        // Загружаем брони
        const bookings = await loadBookings(flightId);
        renderBookingsTable(bookings);

        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('bookingsModal'));
        modal.show();

        // Скрываем секцию переноса
        document.getElementById('transferSection').style.display = 'none';

    } catch (error) {
        console.error('Ошибка показа броней:', error);
        showMessage('Ошибка загрузки броней: ' + error.message, 'danger');
    }
}

function renderBookingsTable(bookings) {
    const table = document.getElementById('bookingsTable');
    if (!table) return;

    if (!bookings || bookings.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-4">
                    <i class="bi bi-ticket" style="font-size: 2rem; color: #6c757d;"></i>
                    <p class="mt-2 mb-0">Бронирований нет</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    bookings.forEach(booking => {
        html += `
            <tr>
                <td><small>${booking.id.substring(0, 8)}...</small></td>
                <td><strong>${booking.passenger_name}</strong></td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-warning"
                                onclick="showTransferSection('${booking.id}', '${booking.passenger_name}')">
                            <i class="bi bi-arrow-right"></i> Перенести
                        </button>
                        <button class="btn btn-danger" onclick="deleteBooking('${booking.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    table.innerHTML = html;
}

async function showTransferSection(bookingId, passengerName) {
    currentBookingId = bookingId;

    try {
        // Устанавливаем информацию о пассажире
        document.getElementById('transferPassenger').textContent = passengerName;
        document.getElementById('transferBookingIdDebug').textContent = `ID: ${bookingId.substring(0, 8)}...`;

        // Загружаем доступные рейсы
        const availableFlights = await loadAvailableFlightsForTransfer(currentFlightId);

        // Заполняем выпадающий список
        const select = document.getElementById('transferFlightSelect');
        select.innerHTML = '<option value="">Выберите новый рейс...</option>';

        if (availableFlights.length === 0) {
            select.innerHTML += '<option value="" disabled>Нет доступных рейсов для переноса</option>';
            showMessage('Нет доступных рейсов для переноса', 'warning');
        } else {
            availableFlights.forEach(flight => {
                const date = new Date(flight.departure_datetime);
                const formattedDate = date.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                select.innerHTML += `
                    <option value="${flight.id}">
                        ${formattedDate} - ${flight.airplane_name} (${flight.available_seats} свободно)
                    </option>
                `;
            });
        }

        // Показываем секцию переноса
        document.getElementById('transferSection').style.display = 'block';
        select.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Ошибка показа секции переноса:', error);
        showMessage('Ошибка загрузки рейсов для переноса: ' + error.message, 'danger');
    }
}

async function transferBooking() {
    const select = document.getElementById('transferFlightSelect');
    const newFlightId = select.value;

    if (!newFlightId) {
        showMessage('Выберите новый рейс для переноса', 'warning');
        return;
    }

    showLoading(true, 'Перенос брони...');

    try {
        const response = await fetch(`/api/bookings/${currentBookingId}/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                new_flight_id: newFlightId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');

            // Закрываем секцию переноса
            document.getElementById('transferSection').style.display = 'none';
            select.selectedIndex = 0;

            // Обновляем данные
            await loadFlights();

            // Перезагружаем брони текущего рейса
            const bookings = await loadBookings(currentFlightId);
            renderBookingsTable(bookings);

        } else {
            showMessage(data.error || 'Ошибка переноса', 'danger');
        }
    } catch (error) {
        console.error('Ошибка переноса брони:', error);
        showMessage('Ошибка переноса: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Удаление рейса (ИСПРАВЛЕННАЯ ФУНКЦИЯ)
async function deleteFlightConfirm(flightId, destination) {
    // Сначала получаем информацию о рейсе
    const flight = flights.find(f => f.id === flightId);
    if (!flight) {
        showMessage('Рейс не найден', 'danger');
        return;
    }

    let confirmMessage = `Вы уверены, что хотите удалить рейс в ${destination}?`;

    if (flight.bookings_count > 0) {
        confirmMessage += `\n\nНа этот рейс есть ${flight.bookings_count} броней. При удалении рейса все брони также будут удалены.`;
    }

    if (!confirm(confirmMessage)) {
        return;
    }

    showLoading(true, 'Удаление рейса...');

    try {
        const response = await fetch(`/api/flights/${flightId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');
            // Обновляем список рейсов
            await loadFlights();
        } else {
            showMessage(data.error || 'Ошибка удаления рейса', 'danger');
        }
    } catch (error) {
        console.error('Ошибка удаления рейса:', error);
        showMessage('Ошибка удаления: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Добавление брони
function showAddBookingModal() {
    document.getElementById('currentFlightIdForBooking').value = currentFlightId;
    document.getElementById('passengerName').value = '';

    const modal = new bootstrap.Modal(document.getElementById('addBookingModal'));
    modal.show();
}

async function addBooking() {
    const flightId = document.getElementById('currentFlightIdForBooking').value;
    const passengerName = document.getElementById('passengerName').value.trim();

    if (!passengerName) {
        showMessage('Введите ФИО пассажира', 'warning');
        return;
    }

    showLoading(true, 'Добавление брони...');

    try {
        const response = await fetch(`/api/flights/${flightId}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                passenger_name: passengerName
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');

            // Закрываем модальное окно
            bootstrap.Modal.getInstance(document.getElementById('addBookingModal')).hide();

            // Обновляем данные
            await loadFlights();

            // Перезагружаем брони
            const bookings = await loadBookings(flightId);
            renderBookingsTable(bookings);

        } else {
            showMessage(data.error || 'Ошибка добавления', 'danger');
        }
    } catch (error) {
        console.error('Ошибка добавления брони:', error);
        showMessage('Ошибка добавления: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Удаление брони
async function deleteBooking(bookingId) {
    if (!confirm('Вы уверены, что хотите удалить эту бронь?')) {
        return;
    }

    showLoading(true, 'Удаление брони...');

    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');

            // Обновляем данные
            await loadFlights();

            // Перезагружаем брони
            const bookings = await loadBookings(currentFlightId);
            renderBookingsTable(bookings);

        } else {
            showMessage(data.error || 'Ошибка удаления', 'danger');
        }
    } catch (error) {
        console.error('Ошибка удаления брони:', error);
        showMessage('Ошибка удаления: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Работа с рейсами
function editFlight(flightId) {
    const flight = flights.find(f => f.id === flightId);
    if (!flight) {
        showMessage('Рейс не найден', 'danger');
        return;
    }

    // Заполняем форму данными рейса
    document.getElementById('flightId').value = flight.id;

    // Форматируем дату для input[type="datetime-local"]
    const departureDate = new Date(flight.departure_datetime);
    const formattedDate = departureDate.toISOString().slice(0, 16);

    document.getElementById('departureDatetime').value = formattedDate;
    document.getElementById('destination').value = flight.destination;

    // Загружаем самолеты если еще не загружены
    if (airplanes.length === 0) {
        loadAirplanes().then(() => {
            document.getElementById('airplaneSelect').value = flight.airplane.id;
            const modal = new bootstrap.Modal(document.getElementById('flightModal'));
            document.querySelector('#flightModal .modal-title').textContent = 'Редактировать рейс';
            modal.show();
        });
    } else {
        document.getElementById('airplaneSelect').value = flight.airplane.id;
        const modal = new bootstrap.Modal(document.getElementById('flightModal'));
        document.querySelector('#flightModal .modal-title').textContent = 'Редактировать рейс';
        modal.show();
    }
}

function showFlightModal() {
    // Сбрасываем форму
    document.getElementById('flightForm').reset();
    document.getElementById('flightId').value = '';
    document.querySelector('#flightModal .modal-title').textContent = 'Добавить рейс';

    // Загружаем самолеты если еще не загружены
    if (airplanes.length === 0) {
        loadAirplanes().then(() => {
            const modal = new bootstrap.Modal(document.getElementById('flightModal'));
            modal.show();
        });
    } else {
        const modal = new bootstrap.Modal(document.getElementById('flightModal'));
        modal.show();
    }
}

async function saveFlight() {
    const flightId = document.getElementById('flightId').value;
    const departureDatetime = document.getElementById('departureDatetime').value;
    const destination = document.getElementById('destination').value.trim();
    const airplaneId = document.getElementById('airplaneSelect').value;

    // Валидация
    if (!departureDatetime || !destination || !airplaneId) {
        showMessage('Заполните все обязательные поля', 'warning');
        return;
    }

    const flightData = {
        departure_datetime: departureDatetime,
        destination: destination,
        airplane_id: airplaneId
    };

    const url = flightId ? `/api/flights/${flightId}` : '/api/flights';
    const method = flightId ? 'PUT' : 'POST';

    showLoading(true, 'Сохранение рейса...');

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(flightData)
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');

            // Закрываем модальное окно
            bootstrap.Modal.getInstance(document.getElementById('flightModal')).hide();

            // Обновляем данные
            await loadFlights();

        } else {
            showMessage(data.error || 'Ошибка сохранения', 'danger');
        }
    } catch (error) {
        console.error('Ошибка сохранения рейса:', error);
        showMessage('Ошибка сохранения: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Вспомогательные функции
function populateAirplaneSelect() {
    const select = document.getElementById('airplaneSelect');
    if (!select) return;

    let options = '<option value="">Выберите самолет...</option>';
    airplanes.forEach(airplane => {
        options += `<option value="${airplane.id}">${airplane.name} (${airplane.capacity} мест)</option>`;
    });

    select.innerHTML = options;
}

function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('message');
    const messageText = document.getElementById('messageText');

    if (!messageDiv || !messageText) return;

    messageText.textContent = message;
    messageDiv.className = `alert alert-${type} alert-dismissible fade show`;
    messageDiv.style.display = 'block';

    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

function showLoading(show, text = 'Загрузка данных...') {
    const loadingElement = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');

    if (loadingElement) {
        loadingElement.style.display = show ? 'flex' : 'none';
    }

    if (loadingText) {
        loadingText.textContent = text;
    }
}

function updateFilters() {
    const filter = document.getElementById('airplaneFilter');
    if (!filter) return;

    // Получаем уникальные самолеты
    const uniqueAirplanes = [...new Set(flights.map(f => f.airplane.name))];

    let options = '<option value="">Все самолеты</option>';
    uniqueAirplanes.forEach(airplane => {
        options += `<option value="${airplane}">${airplane}</option>`;
    });

    filter.innerHTML = options;
}

function filterFlights() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const airplaneFilter = document.getElementById('airplaneFilter')?.value || '';
    const availabilityFilter = document.getElementById('availabilityFilter')?.value || '';

    const filtered = flights.filter(flight => {
        // Поиск по направлению
        const matchesSearch = flight.destination.toLowerCase().includes(searchTerm);

        // Фильтр по самолету
        const matchesAirplane = !airplaneFilter || flight.airplane.name === airplaneFilter;

        // Фильтр по доступности
        let matchesAvailability = true;
        if (availabilityFilter === 'available') {
            matchesAvailability = flight.available_seats > 0;
        } else if (availabilityFilter === 'full') {
            matchesAvailability = flight.available_seats <= 0;
        }

        return matchesSearch && matchesAirplane && matchesAvailability;
    });

    // Временно заменяем flights для рендеринга
    const originalFlights = flights;
    flights = filtered;
    renderFlights();
    flights = originalFlights;
}

function updateStats() {
    const totalFlights = flights.length;
    const totalAirplanes = airplanes.length;

    document.getElementById('totalFlights').textContent = totalFlights;
    document.getElementById('totalAirplanes').textContent = totalAirplanes;

    // Подсчитываем общее количество броней
    const totalBookings = flights.reduce((sum, flight) => sum + flight.bookings_count, 0);

    const statsInfo = document.getElementById('statsInfo');
    if (statsInfo) {
        statsInfo.textContent = `Рейсы: ${totalFlights} | Самолеты: ${totalAirplanes} | Брони: ${totalBookings}`;
    }
}

function setupEventListeners() {
    // Вкладки
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();

            // Убираем активный класс у всех вкладок
            document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

            // Активируем текущую вкладку
            tab.classList.add('active');
            const tabName = tab.getAttribute('data-tab');
            document.getElementById(`${tabName}Content`).style.display = 'block';
        });
    });

    // Фильтрация
    document.getElementById('searchInput')?.addEventListener('input', filterFlights);
    document.getElementById('airplaneFilter')?.addEventListener('change', filterFlights);
    document.getElementById('availabilityFilter')?.addEventListener('change', filterFlights);

    // Перенос брони
    const transferSelect = document.getElementById('transferFlightSelect');
    if (transferSelect) {
        transferSelect.addEventListener('change', function() {
            const transferButton = document.getElementById('transferButton');
            if (transferButton) {
                transferButton.disabled = !this.value;
            }
        });
    }
}

// Глобальные функции
window.showBookings = showBookings;
window.showTransferSection = showTransferSection;
window.transferBooking = transferBooking;
window.cancelTransfer = function() {
    document.getElementById('transferSection').style.display = 'none';
    document.getElementById('transferFlightSelect').selectedIndex = 0;
    const transferButton = document.getElementById('transferButton');
    if (transferButton) transferButton.disabled = true;
};
window.deleteBooking = deleteBooking;
window.deleteFlight = deleteFlightConfirm;
window.deleteFlightConfirm = deleteFlightConfirm;
window.editFlight = editFlight;
window.saveFlight = saveFlight;
window.showFlightModal = showFlightModal;
window.showAddBookingModal = showAddBookingModal;
window.addBooking = addBooking;
window.refreshData = loadInitialData;
window.refreshAirplanes = loadAirplanes;
window.filterFlights = filterFlights;