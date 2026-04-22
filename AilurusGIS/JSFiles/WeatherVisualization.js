/**
 * Глобальная тепловая карта и умный поиск погоды по городам.
 * Экономит запросы к API с помощью LocalStorage и добавляет интерфейс.
 * Теперь с поддержкой динамического поиска городов через серверную БД SQLite.
 * @param {Cesium.Viewer} viewer 
 */
async function initWeatherVisualization(viewer) {
    console.log('WeatherVisualization: Инициализация интерфейса и тепловой карты...');

    let heatmapLayer = null;
    let selectedCityEntity = null; // Текущая отображаемая точка города
    let windFlowController = null;
    let windInitInProgress = false;
    
    let isHeatmapLoaded = false;
    let isHeatmapLoading = false;

    const openMeteoApiKey =
        window.OPEN_METEO_API_KEY ||
        window.OPEN_METEO_API_TOKEN ||
        window.openMeteoApiKey ||
        '';

    function buildOpenMeteoUrl(paramsObject) {
        const params = new URLSearchParams(paramsObject);
        if (openMeteoApiKey) {
            params.set('apikey', openMeteoApiKey);
        }
        return `/api/open-meteo/forecast?${params.toString()}`;
    }

    function makeCityWeatherCacheKey(lat, lon) {
        return `cesium_city_weather_${Number(lat).toFixed(3)}_${Number(lon).toFixed(3)}`;
    }

    function readCityWeatherCache(lat, lon, allowStale = false) {
        const raw = localStorage.getItem(makeCityWeatherCacheKey(lat, lon));
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.timestamp || !parsed.current) return null;

            const isFresh = Date.now() - parsed.timestamp < 1000 * 60 * 30;
            if (isFresh || allowStale) {
                return parsed.current;
            }
        } catch (_e) {
            return null;
        }

        return null;
    }

    function writeCityWeatherCache(lat, lon, current) {
        try {
            localStorage.setItem(makeCityWeatherCacheKey(lat, lon), JSON.stringify({
                timestamp: Date.now(),
                current
            }));
        } catch (_e) {
            // ignore localStorage errors
        }
    }

    function normalizeDegrees(deg) {
        let value = deg;
        while (value < 0) value += 360;
        while (value >= 360) value -= 360;
        return value;
    }

    function buildFallbackWeatherFromWindCache(lat, lon) {
        const raw = localStorage.getItem('cesium_windflow_cache_v1');
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed?.data) ? parsed.data : [];
            if (!items.length) return null;

            let nearest = null;
            let bestDistance = Number.POSITIVE_INFINITY;

            items.forEach((item) => {
                const dLat = Number(item.lat) - Number(lat);
                const dLon = Number(item.lon) - Number(lon);
                const distance = dLat * dLat + dLon * dLon;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    nearest = item;
                }
            });

            if (!nearest) return null;

            const directionFrom = normalizeDegrees((Math.atan2(-nearest.u, -nearest.v) * 180) / Math.PI);
            return {
                temperature_2m: Number(nearest.temp) || 0,
                wind_speed_10m: Math.round((Number(nearest.speedMs) || 0) * 3.6),
                wind_direction_10m: directionFrom,
                weather_code: -1,
                _fallback: true
            };
        } catch (_e) {
            return null;
        }
    }

    function buildFallbackWeatherFromHeatmapCache(lat, lon) {
        const raw = localStorage.getItem('cesium_heatmap_cache_v4');
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed?.data) ? parsed.data : [];
            if (!items.length) return null;

            let nearest = null;
            let bestDistance = Number.POSITIVE_INFINITY;

            items.forEach((item) => {
                const itemLat = Number(item.latitude);
                const itemLon = Number(item.longitude);
                if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return;

                const dLat = itemLat - Number(lat);
                const dLon = itemLon - Number(lon);
                const distance = dLat * dLat + dLon * dLon;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    nearest = item;
                }
            });

            if (!nearest || !nearest.current) return null;

            return {
                temperature_2m: Number(nearest.current.temperature_2m) || 0,
                wind_speed_10m: 0,
                wind_direction_10m: 0,
                weather_code: -1,
                _fallback: true
            };
        } catch (_e) {
            return null;
        }
    }

    function readHeatmapCache(expectedCount, allowStale = false) {
        const CACHE_KEY = 'cesium_heatmap_cache_v4';
        localStorage.removeItem('cesium_heatmap_cache_v3');
        const CACHE_TIME_MS = 1000 * 60 * 60;
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (!cachedStr) {
            return [];
        }

        try {
            const parsed = JSON.parse(cachedStr);
            if (!parsed || !Array.isArray(parsed.data) || !parsed.timestamp) {
                return [];
            }

            const minimumCoverage = Math.floor(expectedCount * 0.85);
            if (parsed.data.length < minimumCoverage) {
                return [];
            }

            const isFresh = Date.now() - parsed.timestamp < CACHE_TIME_MS;
            if (isFresh || allowStale) {
                return parsed.data;
            }
        } catch (e) {
            console.error("Ошибка чтения кэша", e);
        }

        return [];
    }

    async function fetchOpenMeteoPointBatch(points, currentValue) {
        const lats = points.map(loc => loc.lat).join(',');
        const lons = points.map(loc => loc.lon).join(',');
        const url = buildOpenMeteoUrl({
            latitude: lats,
            longitude: lons,
            current: currentValue
        });

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Open-Meteo HTTP ${response.status}`);
        }

        const data = await response.json();
        const list = Array.isArray(data) ? data : [data];
        return list.filter(d => d && d.current);
    }

    async function fetchOpenMeteoGrid(points, currentValue) {
        try {
            return await fetchOpenMeteoPointBatch(points, currentValue);
        } catch (error) {
            if (points.length <= 32) {
                throw error;
            }

            const mid = Math.ceil(points.length / 2);
            const left = await fetchOpenMeteoGrid(points.slice(0, mid), currentValue);
            await new Promise(resolve => setTimeout(resolve, 400));
            const right = await fetchOpenMeteoGrid(points.slice(mid), currentValue);
            return left.concat(right);
        }
    }

    // Стили для темного скроллбара
    const scrollStyle = document.createElement('style');
    scrollStyle.innerHTML = `
        #weatherSearchDropdown::-webkit-scrollbar { width: 6px; }
        #weatherSearchDropdown::-webkit-scrollbar-track { background: #1e1e1e; border-radius: 4px; }
        #weatherSearchDropdown::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        #weatherSearchDropdown::-webkit-scrollbar-thumb:hover { background: #777; }
    `;
    document.head.appendChild(scrollStyle);

    // ==========================================
    // 2. СОЗДАНИЕ ИНТЕРФЕЙСА ДЛЯ КНОПОК
    // ==========================================
    const uiContainer = document.createElement('div');
    uiContainer.id = 'weatherUiContainer'; 
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '15px';
    // Отступ 'left' теперь управляется через CSS переменные из CityDetailsPanel.js
    uiContainer.style.zIndex = '1000';
    uiContainer.style.display = 'flex';
    uiContainer.style.gap = '10px';
    uiContainer.style.fontFamily = 'sans-serif';
    uiContainer.style.alignItems = 'center';

    // -- Кнопка вкл/выкл Тепловой карты --
    const btnHeatmap = document.createElement('button');
    btnHeatmap.className = 'cesium-button cesium-toolbar-button'; 
    btnHeatmap.style.width = '30px';  
    btnHeatmap.style.height = '30px'; 
    btnHeatmap.style.padding = '0';
    btnHeatmap.style.display = 'flex';
    btnHeatmap.style.justifyContent = 'center';
    btnHeatmap.style.alignItems = 'center';
    // Сразу активна
    btnHeatmap.style.opacity = '1.0';
    btnHeatmap.style.pointerEvents = 'auto';
    btnHeatmap.title = 'Тепловая карта (Вкл/Выкл)';

    const iconHeatmap = document.createElement('img');
    iconHeatmap.src = 'Sprites/Icons/HeatMap.png';
    iconHeatmap.style.width = '20px';  
    iconHeatmap.style.height = '20px';
    btnHeatmap.appendChild(iconHeatmap);
    uiContainer.appendChild(btnHeatmap);

    // -- Кнопка вкл/выкл визуализации ветра --
    const btnWind = document.createElement('button');
    btnWind.className = 'cesium-button cesium-toolbar-button';
    btnWind.style.width = '30px';
    btnWind.style.height = '30px';
    btnWind.style.padding = '0';
    btnWind.style.display = 'flex';
    btnWind.style.justifyContent = 'center';
    btnWind.style.alignItems = 'center';
    btnWind.style.opacity = '1.0';
    btnWind.style.pointerEvents = 'auto';
    btnWind.title = 'Ветер (Вкл/Выкл)';

    const iconWind = document.createElement('img');
    iconWind.src = 'Sprites/Icons/Wind.png';
    iconWind.style.width = '20px';
    iconWind.style.height = '20px';
    btnWind.appendChild(iconWind);
    uiContainer.appendChild(btnWind);
    viewer.container.appendChild(uiContainer);

    // ==========================================
    // 3. КОМБОБОКС ПОИСКА С СЕРВЕРОМ БД
    // ==========================================
    const searchWrapper = document.createElement('div');
    searchWrapper.style.position = 'relative';
    searchWrapper.style.width = '100%';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Поиск по всему миру...';
    searchInput.style.background = 'rgba(20, 20, 20, 0.85)';
    searchInput.style.border = '1px solid #555';
    searchInput.style.color = '#fff';
    searchInput.style.padding = '8px 12px';
    searchInput.style.fontSize = '14px'; 
    searchInput.style.borderRadius = '4px';
    searchInput.style.width = '100%'; 
    searchInput.style.boxSizing = 'border-box';
    searchInput.style.outline = 'none';
    searchWrapper.appendChild(searchInput);

    const dropdown = document.createElement('div');
    dropdown.id = 'weatherSearchDropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.top = '100%';
    dropdown.style.left = '0';
    dropdown.style.width = '100%';
    dropdown.style.maxHeight = '250px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.background = '#222222'; 
    dropdown.style.border = '1px solid #555';
    dropdown.style.borderRadius = '0 0 4px 4px';
    dropdown.style.display = 'none';
    dropdown.style.flexDirection = 'column';
    dropdown.style.zIndex = '2000';
    searchWrapper.appendChild(dropdown);

    // Подключение поиска к боковой панели (CityDetailsPanel)
    const searchSlot = document.getElementById('cityDetailsSearchSlot');
    if (searchSlot) {
        searchSlot.appendChild(searchWrapper);
    } else {
        searchWrapper.style.width = '220px';
        uiContainer.appendChild(searchWrapper);
    }

    if (typeof initWindFlowVisualization !== 'function') {
        btnWind.title = 'Модуль ветра не найден';
        btnWind.style.opacity = '0.5';
        btnWind.style.pointerEvents = 'none';
    }

    btnWind.addEventListener('click', async () => {
        if (typeof initWindFlowVisualization !== 'function' || windInitInProgress) return;

        if (!windFlowController) {
            windInitInProgress = true;
            btnWind.style.opacity = '0.7';
            btnWind.style.pointerEvents = 'none';
            // Добавлен индикатор загрузки
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Инициализация данных о ветре...') : null;

            windFlowController = initWindFlowVisualization(viewer, {
                apiKey: openMeteoApiKey
            });

            const isReady = await windFlowController.whenReady;
            windInitInProgress = false;
            btnWind.style.opacity = '1.0';
            btnWind.style.pointerEvents = 'auto';
            
            if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);

            if (!isReady) {
                windFlowController = null;
                btnWind.title = 'Ветер: ошибка, нажмите для повтора';
                alert('Не удалось загрузить данные ветра (возможен лимит API). Попробуйте снова через минуту.');
                return;
            }

            btnWind.title = 'Ветер (Вкл/Выкл)';
        }

        const isOn = windFlowController.toggle();
        btnWind.style.backgroundColor = isOn ? 'rgba(38, 84, 121, 1)' : '';
    });

    // ==========================================
    // ЛОГИКА ПОИСКА И ОТОБРАЖЕНИЯ ТОЧЕК
    // ==========================================
    function renderDropdown(cityList = [], isLoading = false, errorMessage = null) {
        dropdown.innerHTML = '';
        
        const clearItem = document.createElement('div');
        clearItem.innerText = 'Скрыть город';
        clearItem.style.padding = '8px 12px';
        clearItem.style.fontSize = '13px';
        clearItem.style.cursor = 'pointer';
        clearItem.style.borderBottom = '1px solid #444';
        clearItem.style.fontWeight = 'bold';
        clearItem.style.color = '#ff6b6b';
        clearItem.onmouseover = () => clearItem.style.background = '#3a3a3a';
        clearItem.onmouseout = () => clearItem.style.background = 'transparent';
        clearItem.onclick = () => {
            if (selectedCityEntity) viewer.entities.remove(selectedCityEntity);
            selectedCityEntity = null;
            searchInput.value = '';
            searchInput.placeholder = 'Поиск по всему миру...';
            dropdown.style.display = 'none';
            
            if (window.CityDetailsPanel) {
                window.CityDetailsPanel.clear();
            }
        };
        dropdown.appendChild(clearItem);

        if (isLoading) {
            const loadingItem = document.createElement('div');
            loadingItem.innerText = 'Поиск...';
            loadingItem.style.padding = '8px 12px';
            loadingItem.style.fontSize = '13px';
            loadingItem.style.color = '#aaa';
            dropdown.appendChild(loadingItem);
            return;
        }

        if (errorMessage) {
            const errItem = document.createElement('div');
            errItem.innerText = 'Ошибка БД: ' + errorMessage;
            errItem.style.padding = '8px 12px';
            errItem.style.fontSize = '12px';
            errItem.style.color = '#ff6b6b';
            dropdown.appendChild(errItem);
            return;
        }

        if (cityList.length === 0 && searchInput.value.length >= 2) {
            const noRes = document.createElement('div');
            noRes.innerText = 'Ничего не найдено';
            noRes.style.padding = '8px 12px';
            noRes.style.fontSize = '13px';
            noRes.style.color = '#aaa';
            dropdown.appendChild(noRes);
            return;
        }

        cityList.forEach(city => {
            const item = document.createElement('div');
            // Если есть код страны, добавляем его для визуального удобства
            const countryStr = city.country_code ? ` (${city.country_code})` : '';
            item.innerText = city.fullName || `${city.name}${countryStr}`;
            item.style.padding = '8px 12px';
            item.style.fontSize = '13px'; 
            item.style.cursor = 'pointer';
            item.style.color = '#fff';
            item.onmouseover = () => item.style.background = '#3071a9'; 
            item.onmouseout = () => item.style.background = 'transparent';
            item.onclick = () => loadCityWeather(city);
            dropdown.appendChild(item);
        });
    }

    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Очищаем предыдущий таймер
        if (searchTimeout) clearTimeout(searchTimeout);

        if (query.length < 2) {
            renderDropdown([]);
            dropdown.style.display = 'none';
            return;
        }

        // Показываем "Загрузка..."
        renderDropdown([], true);
        dropdown.style.display = 'flex';

        // Отправляем запрос через 400мс после того как пользователь перестал вводить (debounce)
        searchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&accept-language=ru`);
                if (response.ok) {
                    const data = await response.json();
                    const formattedData = data.map(item => ({
                        name: item.name || item.display_name.split(',')[0],
                        fullName: item.display_name,
                        lat: parseFloat(item.lat),
                        lon: parseFloat(item.lon)
                    }));
                    renderDropdown(formattedData);
                } else {
                    console.error("Ошибка поиска Nominatim:", response.status);
                    renderDropdown([], false, `HTTP ${response.status}`);
                }
            } catch (error) {
                console.error("Ошибка сети при поиске городов:", error);
                renderDropdown([], false, "Ошибка сети");
            }
        }, 400);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length >= 2 || dropdown.children.length > 1) {
            dropdown.style.display = 'flex';
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchWrapper.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Функция загрузки детальной погоды
    async function loadCityWeather(city) {
        searchInput.value = '';
        searchInput.placeholder = city.name;
        dropdown.style.display = 'none';
        
        if (selectedCityEntity) viewer.entities.remove(selectedCityEntity);
        
        // Если в БД нет координат, получаем их на лету через бесплатный геокодер Open-Meteo
        if (city.lat === null || city.lon === null || city.lat === undefined || city.lon === undefined) {
            console.log(`Координаты для ${city.name} отсутствуют в БД. Запрашиваем через Geocoding API...`);
            try {
                // Ищем координаты города по его имени через Open-Meteo Geocoding API
                const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.name)}&count=1&language=ru&format=json`;
                const geoRes = await fetch(geoUrl);
                
                if (!geoRes.ok) throw new Error("Ошибка сервиса геокодирования");
                
                const geoData = await geoRes.json();
                
                if (geoData.results && geoData.results.length > 0) {
                    // Подставляем найденные координаты
                    city.lat = geoData.results[0].latitude;
                    city.lon = geoData.results[0].longitude;
                } else {
                    alert(`Для локации "${city.name}" отсутствуют координаты в БД, и онлайн-геосервис не смог их найти.`);
                    return;
                }
            } catch (geoErr) {
                console.error("Ошибка геокодирования:", geoErr);
                alert(`Ошибка при автоматическом поиске координат для "${city.name}": ${geoErr.message}`);
                return;
            }
        }

        try {
            const freshCache = readCityWeatherCache(city.lat, city.lon, false);
            let current = freshCache;

            if (!current) {
                const url = buildOpenMeteoUrl({
                    latitude: String(city.lat),
                    longitude: String(city.lon),
                    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code'
                });
                const res = await fetch(url);

                if (!res.ok) {
                    throw new Error(res.status === 429
                        ? "Превышен лимит запросов к погодному API. Подождите пару минут."
                        : `Ошибка сети: ${res.status}`);
                }

                const data = await res.json();
                if (data.error) throw new Error(data.reason || "Ошибка от API погоды");
                if (!data.current) throw new Error("Нет данных о текущей погоде");

                current = data.current;
                writeCityWeatherCache(city.lat, city.lon, current);
            }

            const temp = Math.round(current.temperature_2m);
            const wind = Math.round(current.wind_speed_10m);
            const windFromStr = getWindDirection(current.wind_direction_10m);
            const windToStr = getWindDirectionTo(current.wind_direction_10m);
            const weatherDesc = getWeatherDescription(current.weather_code);
            const colorHex = getTempColorHex(current.temperature_2m);
            
            const pinCanvas = createDoubleOutlinePin(colorHex);
            
            selectedCityEntity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat),
                billboard: {
                    image: pinCanvas,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER
                },
                label: {
                    text: `${city.name}\n${temp}°C\n${weatherDesc}\nВетер откуда: ${windFromStr}\nВетер куда: ${windToStr} ${wind} км/ч`,
                    font: 'bold 18px sans-serif', 
                    fillColor: Cesium.Color.WHITE,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 4,
                    outlineColor: Cesium.Color.BLACK,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    horizontalOrigin: Cesium.HorizontalOrigin.LEFT, 
                    pixelOffset: new Cesium.Cartesian2(28, 0), 
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, 
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });

            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 4000000),
                duration: 1.5
            });

            // ОБНОВЛЯЕМ ПАНЕЛЬ ДЕТАЛЕЙ
            if (window.CityDetailsPanel) {
                window.CityDetailsPanel.show(city, { weatherCurrent: current });
            }

        } catch (error) {
            const staleCache = readCityWeatherCache(city.lat, city.lon, true);
            const fallbackWeather =
                staleCache ||
                buildFallbackWeatherFromWindCache(city.lat, city.lon) ||
                buildFallbackWeatherFromHeatmapCache(city.lat, city.lon);

            if (fallbackWeather) {
                console.warn("Погода города загружена из fallback-кэша:", error);

                const temp = Math.round(fallbackWeather.temperature_2m);
                const wind = Math.round(fallbackWeather.wind_speed_10m || 0);
                const windFromStr = getWindDirection(fallbackWeather.wind_direction_10m || 0);
                const windToStr = getWindDirectionTo(fallbackWeather.wind_direction_10m || 0);
                const weatherDesc = fallbackWeather._fallback ? 'Данные из кэша' : getWeatherDescription(fallbackWeather.weather_code);
                const colorHex = getTempColorHex(fallbackWeather.temperature_2m);
                const pinCanvas = createDoubleOutlinePin(colorHex);

                selectedCityEntity = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat),
                    billboard: {
                        image: pinCanvas,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        verticalOrigin: Cesium.VerticalOrigin.CENTER,
                        horizontalOrigin: Cesium.HorizontalOrigin.CENTER
                    },
                    label: {
                        text: `${city.name}\n${temp}°C\n${weatherDesc}\nВетер откуда: ${windFromStr}\nВетер куда: ${windToStr} ${wind} км/ч`,
                        font: 'bold 18px sans-serif',
                        fillColor: Cesium.Color.WHITE,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        outlineWidth: 4,
                        outlineColor: Cesium.Color.BLACK,
                        verticalOrigin: Cesium.VerticalOrigin.CENTER,
                        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                        pixelOffset: new Cesium.Cartesian2(28, 0),
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    }
                });

                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 4000000),
                    duration: 1.5
                });

                if (window.CityDetailsPanel) {
                    window.CityDetailsPanel.show(city, { weatherCurrent: fallbackWeather });
                }
                return;
            }

            console.error("Ошибка загрузки погоды для города:", error);
            alert(error.message);
        }
    }

    // ==========================================
    // 4. ГЛОБАЛЬНАЯ ТЕПЛОВАЯ КАРТА (С кэшированием)
    // ==========================================
    // Загрузка тепловой карты перенесена в обработчик клика по кнопке
    btnHeatmap.addEventListener('click', async () => {
        if (isHeatmapLoading) return;

        if (!isHeatmapLoaded) {
            isHeatmapLoading = true;
            btnHeatmap.style.opacity = '0.5';
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Генерация погодной тепловой карты...') : null;

            try {
                const gridLocations = [];
                for (let lat = -85; lat <= 85; lat += 10) {
                    for (let lon = -180; lon < 180; lon += 10) {
                        gridLocations.push({ lat, lon });
                    }
                }

                let results = [];
                const CACHE_KEY = 'cesium_heatmap_cache_v4';
                results = readHeatmapCache(gridLocations.length, false);
                if (results.length > 0) {
                    console.log('Тепловая карта загружена из кэша (API сэкономлено)');
                }

                if (results.length === 0) {
                    try {
                        results = await fetchOpenMeteoGrid(gridLocations, 'temperature_2m');
                    } catch (e) {
                        console.error("Сбой сети при загрузке тепловой карты", e);
                        results = readHeatmapCache(gridLocations.length, true);
                    }

                    const minimumCoverage = Math.floor(gridLocations.length * 0.85);
                    if (results.length >= minimumCoverage) {
                        localStorage.setItem(CACHE_KEY, JSON.stringify({
                            timestamp: Date.now(),
                            data: results
                        }));
                    } else if (results.length > 0) {
                        console.warn(`Тепловая карта загружена не полностью: ${results.length} из ${gridLocations.length}. Используем stale-кэш, если он есть.`);
                        const staleCache = readHeatmapCache(gridLocations.length, true);
                        if (staleCache.length > 0) {
                            results = staleCache;
                        } else {
                            throw new Error(`Недостаточно данных для тепловой карты: ${results.length} из ${gridLocations.length}`);
                        }
                    }
                }

                if (results.length === 0) {
                    throw new Error('Нет данных для построения тепловой карты. API вернул пустой ответ или сработал лимит запросов.');
                }

                const canvas = document.createElement('canvas');
                canvas.width = 2048;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.globalCompositeOperation = 'source-over'; 

                results.forEach((weatherData) => {
                    if (!weatherData || !weatherData.current) return;
                    const lat = Number(weatherData.latitude);
                    const lon = Number(weatherData.longitude);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                    
                    const temp = weatherData.current.temperature_2m;

                    const x = (lon + 180) / 360 * canvas.width;
                    const y = (90 - lat) / 180 * canvas.height;
                    const radius = 90; 

                    drawHeatBlob(ctx, x, y, radius, temp);
                    drawHeatBlob(ctx, x - canvas.width, y, radius, temp);
                    drawHeatBlob(ctx, x + canvas.width, y, radius, temp);
                });

                const heatmapProvider = new Cesium.SingleTileImageryProvider({
                    url: canvas.toDataURL("image/png"),
                    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
                });
                heatmapLayer = viewer.imageryLayers.addImageryProvider(heatmapProvider);
                heatmapLayer.alpha = 0.85; 
                heatmapLayer.show = false;
                
                isHeatmapLoaded = true;
            } catch (error) {
                console.error("Критическая ошибка при генерации тепловой карты:", error);
                alert('Ошибка генерации тепловой карты: ' + error.message);
            } finally {
                isHeatmapLoading = false;
                btnHeatmap.style.opacity = '1.0';
                if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
            }
        }

        if (heatmapLayer) {
            heatmapLayer.show = !heatmapLayer.show;
            updateShadersForHeatmap(viewer, heatmapLayer.show);
            viewer.scene.requestRender();
            btnHeatmap.style.backgroundColor = heatmapLayer.show ? 'rgba(38, 84, 121, 1)' : ''; 
        }
    });
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function updateShadersForHeatmap(viewer, isHeatmapOn) {
    const renderOverShaders = true; 

    if (isHeatmapOn && renderOverShaders) {
        viewer.scene.fog.enabled = false;
        viewer.scene.globe.showGroundAtmosphere = false;
        
        for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
            const stage = viewer.scene.postProcessStages.get(i);
            if (stage === viewer.scene.postProcessStages.bloom || 
                stage === viewer.scene.postProcessStages.fxaa ||
                stage === viewer.scene.postProcessStages.ambientOcclusion ||
                (stage.fragmentShader && stage.fragmentShader.includes('maxDelta = glowThickness * rEarth'))) {
                continue;
            }
            if (stage.enabled) {
                stage._wasEnabledBeforeHeatmap = true;
                stage.enabled = false;
            }
        }
    } else {
        viewer.scene.fog.enabled = true;
        viewer.scene.globe.showGroundAtmosphere = true;
        
        for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
            const stage = viewer.scene.postProcessStages.get(i);
            if (stage._wasEnabledBeforeHeatmap) {
                stage.enabled = true;
                delete stage._wasEnabledBeforeHeatmap;
            }
        }
    }
}

function getWeatherDescription(code) {
    const codes = {
        0: 'Ясно',
        1: 'В основном ясно',
        2: 'Переменная облачность',
        3: 'Пасмурно',
        45: 'Туман',
        48: 'Оседающий туман',
        51: 'Легкая морось',
        53: 'Умеренная морось',
        55: 'Густая морось',
        56: 'Легкая ледяная морось',
        57: 'Густая ледяная морось',
        61: 'Слабый дождь',
        63: 'Умеренный дождь',
        65: 'Сильный дождь',
        66: 'Слабый ледяной дождь',
        67: 'Сильный ледяной дождь',
        71: 'Слабый снег',
        73: 'Умеренный снег',
        75: 'Сильный снегопад',
        77: 'Снежные зерна',
        80: 'Слабый ливень',
        81: 'Умеренный ливень',
        82: 'Сильный ливень',
        85: 'Слабый снегопад',
        86: 'Сильный снегопад',
        95: 'Гроза',
        96: 'Гроза с градом',
        99: 'Сильная гроза с градом'
    };
    return codes[code] || 'Неизвестно';
}

function getWindDirection(deg) {
    const dirs = [
        { name: 'Северный', icon: '↓' }, { name: 'С-В', icon: '↙' },
        { name: 'Восточный', icon: '←' }, { name: 'Ю-В', icon: '↖' },
        { name: 'Южный', icon: '↑' }, { name: 'Ю-З', icon: '↗' },
        { name: 'Западный', icon: '→' }, { name: 'С-З', icon: '↘' }
    ];
    const index = Math.round((deg % 360) / 45) % 8;
    return `${dirs[index].name} ${dirs[index].icon}`;
}

function getWindDirectionTo(deg) {
    return getWindDirection((deg + 180) % 360);
}

function createDoubleOutlinePin(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    const cx = 20; const cy = 20;
    
    ctx.beginPath(); ctx.arc(cx, cy, 13.5, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = colorHex; ctx.fill();
    
    return canvas;
}

function drawHeatBlob(ctx, x, y, radius, temp) {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0.0, getTempColorRGBA(temp, 1.00)); 
    grd.addColorStop(0.3, getTempColorRGBA(temp, 0.85)); 
    grd.addColorStop(0.7, getTempColorRGBA(temp, 0.45)); 
    grd.addColorStop(1.0, getTempColorRGBA(temp, 0.00)); 

    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

function getTempColorRGBA(temp, alpha) {
    const t = Math.max(-40, Math.min(45, temp)); 
    let r, g, b;
    if (t < -20) {
        const f = (t + 40) / 20; r = Math.floor(138 * (1 - f)); g = 0; b = 255;
    } else if (t < 0) {
        const f = (t + 20) / 20; r = 0; g = Math.floor(255 * f); b = 255;
    } else if (t < 15) {
        const f = t / 15; r = Math.floor(255 * f); g = 255; b = Math.floor(255 * (1 - f));
    } else if (t < 30) {
        const f = (t - 15) / 15; r = 255; g = Math.floor(255 * (1 - f)); b = 0;
    } else {
        const f = Math.min(1, (t - 30) / 15); r = Math.floor(255 - 100 * f); g = 0; b = 0;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTempColorHex(temp) {
    const rgba = getTempColorRGBA(temp, 1.0);
    const rgb = rgba.match(/\d+/g);
    return "#" + ((1 << 24) + (+rgb[0] << 16) + (+rgb[1] << 8) + +rgb[2]).toString(16).slice(1);
}