/* * * боковая панель (sidebar) в стиле cesium для деталей о городах и погоде * закреплена слева с кнопкой сворачивания выталкивает остальные кнопки меню */
window.CityDetailsPanel = (function() {
    
    // внедряем глобальный стиль для плавного сдвига кнопок
    const syncStyles = document.createElement('style');
    syncStyles.innerHTML = `
        :root {
            --city-sidebar-width: min(320px, calc(100vw - 38px));
            --panel-offset: 15px;
        }
        #weatherUiContainer, #environmentUiContainer, #leftBottomControls,
        #bathymetryUiContainer, #bordersUiContainer, #dnUiContainer,
        #eqUiContainer, #satUiContainer, #dbUiContainer {
            left: var(--panel-offset, 15px) !important;
            transition: left 0.3s ease-in-out !important;
        }
        #cityDetailsSidebar {
            box-sizing: border-box;
            max-width: calc(100vw - 38px);
            overflow: hidden;
        }
        @media (max-width: 768px) {
            html, body, #cesiumContainer {
                overflow: hidden !important;
                overscroll-behavior: none !important;
            }
            #cityDetailsSidebar {
                height: 100vh !important;
                height: 100dvh !important;
                max-height: 100vh !important;
                max-height: 100dvh !important;
            }
        }
    `;
    document.head.appendChild(syncStyles);

    // главный контейнер боковой панели
    const panel = document.createElement('div');
    panel.id = 'cityDetailsSidebar';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.bottom = '0';
    panel.style.left = '0'; // стартовое состояние задаётся ниже: на телефонах закрыто, на десктопе открыто
    panel.style.width = 'var(--city-sidebar-width)'; // не шире экрана с учётом выступающей кнопки
    panel.style.height = '100vh';
    panel.style.height = '100dvh'; 
    panel.style.maxHeight = '100vh';
    panel.style.maxHeight = '100dvh'; // Адаптация под мобильные браузеры с панелями навигации
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.backgroundColor = 'rgba(38, 40, 42, 0.95)'; // Темный фон в стиле Cesium
    panel.style.backdropFilter = 'blur(6px)';
    panel.style.borderRight = '1px solid #444';
    panel.style.boxShadow = '2px 0 15px rgba(0,0,0,0.6)';
    panel.style.zIndex = '1500';
    panel.style.transition = 'left 0.3s ease-in-out';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.style.color = '#fff'; // Белый текст по умолчанию
    panel.style.boxSizing = 'border-box';
    panel.style.overflow = 'hidden';

    // кнопка свернуть/развернуть панель
    const toggleBtn = document.createElement('div');
    toggleBtn.id = 'cityDetailsSidebarToggle';
    toggleBtn.style.position = 'absolute';
    toggleBtn.style.top = '60%';
    toggleBtn.style.right = '-24px'; // Выходит за пределы панели вправо
    toggleBtn.style.width = '24px';
    toggleBtn.style.height = '48px';
    toggleBtn.style.backgroundColor = 'rgba(38, 40, 42, 0.95)';
    toggleBtn.style.border = '1px solid #444';
    toggleBtn.style.borderLeft = 'none';
    toggleBtn.style.borderRadius = '0 6px 6px 0';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.display = 'flex';
    toggleBtn.style.alignItems = 'center';
    toggleBtn.style.justifyContent = 'center';
    toggleBtn.style.transform = 'translateY(-50%)';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.zIndex = '1501';
    toggleBtn.innerHTML = '◀';
    panel.appendChild(toggleBtn);

    // слот для комбобокса с поиском
    const searchSlot = document.createElement('div');
    searchSlot.id = 'cityDetailsSearchSlot';
    searchSlot.style.padding = '15px';
    searchSlot.style.borderBottom = '1px solid #444';
    searchSlot.style.flexShrink = '0'; // Запрещаем сжатие слота поиска
    panel.appendChild(searchSlot);

    // контейнер контента
    const contentSlot = document.createElement('div');
    contentSlot.id = 'cityDetailsContentSlot';
    contentSlot.style.padding = '15px';
    contentSlot.style.overflowY = 'auto';
    contentSlot.style.flex = '1'; // Растягиваем на всю свободную высоту
    contentSlot.style.minHeight = '0'; // Важно для скроллинга внутри flex-контейнера
    
    // стили скроллбара для панели
    const scrollStyle = document.createElement('style');
    scrollStyle.innerHTML = `
        #cityDetailsContentSlot::-webkit-scrollbar { width: 6px; }
        #cityDetailsContentSlot::-webkit-scrollbar-track { background: transparent; }
        #cityDetailsContentSlot::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        #cityDetailsContentSlot::-webkit-scrollbar-thumb:hover { background: #777; }
        .aqi-bar { transition: height 0.3s ease; }
        .aqi-bar:hover { opacity: 0.8; }
    `;
    document.head.appendChild(scrollStyle);
    
    panel.appendChild(contentSlot);
    document.body.appendChild(panel);

    // состояние открытия: на телефонах панель должна быть закрыта при первом открытии карты
    let isOpen = !(window.AilurusIsMobile || window.innerWidth <= 768);

    // внутреннее состояние данных
    let currentCityData = null;
    let currentCityInfo = null;

    // объявление функции
    function updateSidebarState() {
        const offsetHide = 'calc(0px - var(--city-sidebar-width))';
        const offsetOpen = 'calc(var(--city-sidebar-width) + 15px)';

        panel.style.left = isOpen ? '0' : offsetHide;
        toggleBtn.innerHTML = isOpen ? '◀' : '▶';
        toggleBtn.title = isOpen ? 'Скрыть панель города' : 'Показать панель города';
        panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        document.documentElement.style.setProperty('--panel-offset', isOpen ? offsetOpen : '15px');

        // после изменения отступа перестраиваем открытые всплывающие панели, чтобы они не уезжали за экран
        if (window.AilurusPanelManager) {
            window.AilurusPanelManager.update();
            setTimeout(() => window.AilurusPanelManager.update(), 320);
        }
    }

    toggleBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        updateSidebarState();
    });

    updateSidebarState();

    // устанавливаем стартовое состояние (пустое до выбора города)
    function showEmptyState() {
        contentSlot.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #aaa; margin-top: 50px;">
                <img src="Sprites/Icons/City.png" style="width: 64px; height: 64px; margin-bottom: 15px; opacity: 0.7;">
                <p>Выберите город в поиске выше для просмотра погодных данных и качества воздуха.</p>
            </div>
        `;
    }
    showEmptyState();

    // вспомогательные функции
    function getAqiColor(aqi) {
        // проверка условия
        if (aqi === null || aqi === undefined) return { bg: '#555555', fg: '#ffffff', label: 'Нет данных', emoji: 'neutral.png' };
        // проверка условия
        if (aqi <= 50) return { bg: '#009966', fg: '#ffffff', label: 'Хорошо', emoji: 'smile_open.png' };
        // проверка условия
        if (aqi <= 100) return { bg: '#ffde33', fg: '#000000', label: 'Умеренно', emoji: 'smile_closed.png' };
        // проверка условия
        if (aqi <= 150) return { bg: '#ff9933', fg: '#000000', label: 'Чувствит.', emoji: 'neutral.png' };
        // проверка условия
        if (aqi <= 200) return { bg: '#cc0033', fg: '#ffffff', label: 'Вредно', emoji: 'sad.png' };
        // проверка условия
        if (aqi <= 300) return { bg: '#660099', fg: '#ffffff', label: 'Очень вредно', emoji: 'angry.png' };
        // возврат результата
        return { bg: '#7e0023', fg: '#ffffff', label: 'Опасно', emoji: 'dead_tongue.png' };
    }

    // объявление функции
    function getWeatherIcon(code) {
        // проверка условия
        if (code <= 1) return '☀️'; // Ясно
        // проверка условия
        if (code <= 3) return '⛅'; // Облачно
        // проверка условия
        if (code <= 48) return '🌫️'; // Туман
        // проверка условия
        if (code <= 57) return '🌧️'; // Морось
        // проверка условия
        if (code <= 67) return '🌧️'; // Дождь
        // проверка условия
        if (code <= 77) return '❄️'; // Снег
        // проверка условия
        if (code <= 82) return '🌦️'; // Ливень
        // проверка условия
        if (code <= 86) return '🌨️'; // Снегопад
        // проверка условия
        if (code >= 95) return '⛈️'; // Гроза
        // возврат результата
        return '🌤️';
    }

    // объявление функции
    function buildHourlyChart(hourlyData) {
        // проверка условия
        if (!hourlyData || !hourlyData.time || !hourlyData.us_aqi) return '';
        const now = new Date();
        let startIndex = hourlyData.time.findIndex(t => new Date(t) >= now);
        // проверка условия
        if (startIndex === -1) startIndex = 0;
        
        const start = Math.max(0, startIndex - 12);
        const end = Math.min(hourlyData.time.length, startIndex + 12);
        const times = hourlyData.time.slice(start, end);
        const aqis = hourlyData.us_aqi.slice(start, end);
        const maxAqi = Math.max(...aqis.filter(a => a !== null), 50);

        let html = '<div style="display:flex; align-items:flex-end; height:50px; gap:2px; margin-top:5px;">';
        // начало цикла
        for(let i=0; i<aqis.length; i++) {
            const val = aqis[i];
            const heightPct = val === null ? 0 : Math.max(5, (val / maxAqi) * 100);
            const color = getAqiColor(val).bg;
            const hour = new Date(times[i]).getHours();
            html += `<div title="AQI: ${val} (В ${hour}:00)" class="aqi-bar" style="flex:1; background-color:${color}; height:${heightPct}%; border-radius:1px 1px 0 0;"></div>`;
        }
        html += '</div>';
        html += '<div style="display:flex; justify-content:space-between; font-size:10px; color:#aaa; margin-top:4px;"><span>-12ч</span><span>сейчас</span><span>+12ч</span></div>';
        // возврат результата
        return html;
    }

    // объявление функции
    function makeDetailedCacheKey(lat, lon) {
        // возврат результата
        return `cesium_city_details_${Number(lat).toFixed(3)}_${Number(lon).toFixed(3)}`;
    }

    // объявление функции
    function readDetailedCache(lat, lon, allowStale = false) {
        const raw = localStorage.getItem(makeDetailedCacheKey(lat, lon));
        // проверка условия
        if (!raw) return null;

        // начало блока перехвата ошибок
        try {
            const parsed = JSON.parse(raw);
            // проверка условия
            if (!parsed || !parsed.timestamp || !parsed.payload) return null;
            const isFresh = Date.now() - parsed.timestamp < 1000 * 60 * 30;
            // проверка условия
            if (isFresh || allowStale) {
                // возврат результата
                return parsed.payload;
            }
        } catch (_e) {
            // возврат результата
            return null;
        }

        // возврат результата
        return null;
    }

    // объявление функции
    function writeDetailedCache(lat, lon, payload) {
        // начало блока перехвата ошибок
        try {
            localStorage.setItem(makeDetailedCacheKey(lat, lon), JSON.stringify({
                timestamp: Date.now(),
                payload
            }));
        } catch (_e) {}
    }

    // объявление функции
    function buildFallbackDetailedData(lat, lon, prefetchedData) {
        // проверка условия
        if (prefetchedData && prefetchedData.weatherCurrent) {
            // возврат результата
            return {
                aqi: { current: {}, hourly: null },
                weather: { current: prefetchedData.weatherCurrent, daily: {} }
            };
        }

        const windRaw = localStorage.getItem('cesium_windflow_cache_v1');
        // проверка условия
        if (!windRaw) return null;

        // начало блока перехвата ошибок
        try {
            const parsed = JSON.parse(windRaw);
            const items = Array.isArray(parsed?.data) ? parsed.data : [];
            // проверка условия
            if (!items.length) return null;

            let nearest = null;
            let bestDistance = Number.POSITIVE_INFINITY;
            items.forEach((item) => {
                const dLat = Number(item.lat) - Number(lat);
                const dLon = Number(item.lon) - Number(lon);
                const distance = dLat * dLat + dLon * dLon;
                // проверка условия
                if (distance < bestDistance) {
                    bestDistance = distance;
                    nearest = item;
                }
            });

            // проверка условия
            if (!nearest) return null;

            const directionFrom = ((Math.atan2(-nearest.u, -nearest.v) * 180) / Math.PI + 360) % 360;
            // возврат результата
            return {
                aqi: { current: {}, hourly: null },
                weather: {
                    current: {
                        temperature_2m: Number(nearest.temp) || 0,
                        relative_humidity_2m: null,
                        surface_pressure: null,
                        wind_speed_10m: Math.round((Number(nearest.speedMs) || 0) * 3.6),
                        weather_code: -1,
                        wind_direction_10m: directionFrom
                    },
                    daily: {}
                }
            };
        } catch (_e) {
            // возврат результата
            return null;
        }
    }

    // основная функция загрузки детальных данных по городу
    async function fetchDetailedData(lat, lon, prefetchedData) {
        const freshCache = readDetailedCache(lat, lon, false);
        // проверка условия
        if (freshCache) {
            // проверка условия
            if (prefetchedData && prefetchedData.weatherCurrent) {
                freshCache.weather = freshCache.weather || {};
                freshCache.weather.current = Object.assign({}, freshCache.weather.current || {}, prefetchedData.weatherCurrent);
            }
            // возврат результата
            return freshCache;
        }

        const apiKeyParam = (window.OPEN_METEO_API_KEY) ? `&apikey=${window.OPEN_METEO_API_KEY}` : '';
        const aqiUrl = `/api/open-meteo/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=us_aqi&timezone=auto${apiKeyParam}`;
        const weatherUrl = `/api/open-meteo/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,wind_speed_10m_max,precipitation_probability_max&timezone=auto${apiKeyParam}`;

        // начало блока перехвата ошибок
        try {
            // всегда запрашиваем оба api параллельно для получения полных данных (daily humidity pressure)
            const [aqiRes, weatherRes] = await Promise.all([
                fetch(aqiUrl),
                fetch(weatherUrl)
            ]);

            // проверка условия
            if (!aqiRes.ok) throw new Error(`AQI API error: ${aqiRes.status}`);
            // проверка условия
            if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);

            const weatherPayload = await weatherRes.json();

            // prefetcheddata используем только для дополнения current (не заменяем daily)
            if (prefetchedData && prefetchedData.weatherCurrent) {
                weatherPayload.current = Object.assign({}, weatherPayload.current || {}, prefetchedData.weatherCurrent);
            }

            const payload = { aqi: await aqiRes.json(), weather: weatherPayload };
            writeDetailedCache(lat, lon, payload);
            // возврат результата
            return payload;
        } catch (error) {
            const staleCache = readDetailedCache(lat, lon, true);
            // проверка условия
            if (staleCache) {
                // проверка условия
                if (prefetchedData && prefetchedData.weatherCurrent) {
                    staleCache.weather = staleCache.weather || {};
                    staleCache.weather.current = Object.assign({}, staleCache.weather.current || {}, prefetchedData.weatherCurrent);
                }
                // возврат результата
                return staleCache;
            }

            const fallback = buildFallbackDetailedData(lat, lon, prefetchedData);
            // проверка условия
            if (fallback) {
                // возврат результата
                return fallback;
            }

            throw error;
        }
    }

    // объявление функции
    function renderDataForDay(dayIndex) {
        // проверка условия
        if (!currentCityData || !currentCityInfo) return;

        const data = currentCityData;
        const city = currentCityInfo;

        const aqiCurrent = data.aqi?.current || {};
        const weatherCurrent = data.weather?.current || {};
        const dailyData = data.weather?.daily || {};
        const aqiHourly = data.aqi?.hourly;

        let aqiValue, aqiInfo, timeStr, dateStr, tempStr, humidityStr, pressureStr, windStr, headerSubtitle;

        // проверка условия
        if (dayIndex === 0) {
            aqiValue = aqiCurrent.us_aqi;
            aqiInfo = getAqiColor(aqiValue);
            timeStr = new Date(aqiCurrent.time || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            dateStr = new Date(aqiCurrent.time || Date.now()).toLocaleDateString('ru-RU', { weekday: 'long' });
            headerSubtitle = 'Текущие данные';

            tempStr = weatherCurrent.temperature_2m !== undefined && weatherCurrent.temperature_2m !== null ? `${Math.round(weatherCurrent.temperature_2m)}°C` : '-';
            humidityStr = weatherCurrent.relative_humidity_2m !== undefined && weatherCurrent.relative_humidity_2m !== null ? `${weatherCurrent.relative_humidity_2m}%` : '-';
            pressureStr = weatherCurrent.surface_pressure !== undefined && weatherCurrent.surface_pressure !== null ? Math.round(weatherCurrent.surface_pressure) : '-';
            windStr = weatherCurrent.wind_speed_10m !== undefined && weatherCurrent.wind_speed_10m !== null ? `${Math.round(weatherCurrent.wind_speed_10m)} км/ч` : '-';
        } else {
            const targetDate = new Date(dailyData.time[dayIndex]);
            timeStr = ''; 
            dateStr = targetDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
            headerSubtitle = `Прогноз на ${dateStr}`;
            
            let dayAqiValues = [];
            // проверка условия
            if (aqiHourly && aqiHourly.time && aqiHourly.us_aqi) {
                const targetDayStr = dailyData.time[dayIndex]; 
                // начало цикла
                for (let i = 0; i < aqiHourly.time.length; i++) {
                    // проверка условия
                    if (aqiHourly.time[i].startsWith(targetDayStr) && aqiHourly.us_aqi[i] !== null) {
                        dayAqiValues.push(aqiHourly.us_aqi[i]);
                    }
                }
            }
            
            // проверка условия
            if (dayAqiValues.length > 0) {
                const avgAqi = Math.round(dayAqiValues.reduce((a,b)=>a+b,0) / dayAqiValues.length);
                aqiValue = avgAqi;
                aqiInfo = getAqiColor(avgAqi);
                aqiInfo.label += ' (ср.)';
            } else {
                aqiValue = null;
                aqiInfo = getAqiColor(null);
            }

            tempStr = `${Math.round(dailyData.temperature_2m_max[dayIndex])}° / ${Math.round(dailyData.temperature_2m_min[dayIndex])}°`;
            humidityStr = dailyData.precipitation_probability_max && dailyData.precipitation_probability_max[dayIndex] !== undefined ? `${dailyData.precipitation_probability_max[dayIndex]}% (осад.)` : '-';
            pressureStr = '-'; 
            windStr = dailyData.wind_speed_10m_max && dailyData.wind_speed_10m_max[dayIndex] !== undefined ? `${Math.round(dailyData.wind_speed_10m_max[dayIndex])} км/ч (макс)` : '-';
        }

        let html = `
            <div style="margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 10px;">
                <div style="font-size:18px; font-weight:bold; color:#88ceeb; display:flex; align-items:center;">
                    <img src="Sprites/Icons/City.png" style="width:24px; height:24px; margin-right:8px;">
                    ${city.name}
                </div>
                <div style="color:#aaa; font-size:12px; margin-top:4px;">${headerSubtitle}</div>
            </div>

            <div style="display:flex; background-color:${aqiInfo.bg}; color:${aqiInfo.fg}; border-radius:6px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.5); margin-bottom: 15px;">
                <div style="flex:1; text-align:center; padding: 15px 0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div style="font-size:12px; font-weight:bold; opacity: 0.8; margin-bottom: 4px;">ИКВ (AQI)</div>
                    <img src="Sprites/Emojis/${aqiInfo.emoji}" style="width:36px; height:36px; margin-bottom:5px;">
                    <div style="font-size:32px; font-weight:bold; line-height:1;">${aqiValue !== undefined && aqiValue !== null ? aqiValue : '-'}</div>
                </div>
                <div style="flex:1.2; padding: 15px 10px; background-color:rgba(0,0,0,0.15); display:flex; flex-direction:column; justify-content:center;">
                    <div style="font-size:18px; font-weight:bold; margin-bottom:5px;">${aqiInfo.label}</div>
                    <div style="font-size:11px; opacity:0.9;">${dayIndex === 0 ? `Обновлено в ${dateStr}, ${timeStr}` : `Прогноз на весь день`}</div>
                    <div style="font-size:11px; opacity:0.9; margin-top:2px;">t: ${tempStr}</div>
                </div>
            </div>
        `;

        // проверка условия
        if (dayIndex === 0) {
            html += `
                <div style="margin-bottom: 15px;">
                    <div style="font-size:12px; font-weight:bold; color:#aaa;">Прогноз AQI (24 часа)</div>
                    ${buildHourlyChart(data.aqi?.hourly)}
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px; margin-bottom: 20px;">
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>PM2.5:</b> ${aqiCurrent.pm2_5 ?? '-'} μg/m³</div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>PM10:</b> ${aqiCurrent.pm10 ?? '-'} μg/m³</div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>NO2:</b> ${aqiCurrent.nitrogen_dioxide ?? '-'} μg/m³</div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>SO2:</b> ${aqiCurrent.sulphur_dioxide ?? '-'} μg/m³</div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>O3:</b> ${aqiCurrent.ozone ?? '-'} μg/m³</div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; border:1px solid #444;"><b>CO:</b> ${aqiCurrent.carbon_monoxide ?? '-'} μg/m³</div>
                </div>
            `;
        } else {
            html += `
                <div style="margin-bottom: 15px; font-size: 12px; color: #aaa; text-align:center; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    Детальные данные по загрязнителям недоступны для долгосрочного прогноза. Отображается только средний дневной AQI (при наличии).
                </div>
            `;
        }

        html += `
            <div style="background-color:rgba(0,0,0,0.3); border-radius: 4px; color:#88ceeb; text-align:center; padding:6px 0; font-size:12px; font-weight:bold; margin-bottom: 15px;">
                ИНФОРМАЦИЯ О ПОГОДЕ
            </div>

            <div style="display:flex; justify-content:space-between; text-align:center; font-size:13px; margin-bottom: 20px;">
                <div style="flex:1"><div style="font-size:20px;">🌡️</div><b style="font-size:11px;">${tempStr}</b><br><span style="color:#aaa;font-size:11px;">Темп.</span></div>
                <div style="flex:1"><div style="font-size:20px;">💧</div><b style="font-size:11px;">${humidityStr}</b><br><span style="color:#aaa;font-size:11px;">${dayIndex === 0 ? 'Влажн.' : 'Осадки'}</span></div>
                <div style="flex:1"><div style="font-size:20px;">⏱️</div><b style="font-size:11px;">${pressureStr}</b><br><span style="color:#aaa;font-size:11px;">hPa</span></div>
                <div style="flex:1"><div style="font-size:20px;">💨</div><b style="font-size:11px;">${windStr}</b><br><span style="color:#aaa;font-size:11px;">Ветер</span></div>
            </div>

            <div style="background-color:rgba(0,0,0,0.3); border-radius: 4px; color:#88ceeb; text-align:center; padding:6px 0; font-size:12px; font-weight:bold; margin-bottom: 15px;">
                ПРОГНОЗ (5 ДНЕЙ)
            </div>
            <div style="display:flex; justify-content:space-between; overflow-x:auto;">
        `;

        // проверка условия
        if (dailyData.time) {
            const daysLimit = Math.min(5, dailyData.time.length);
            // начало цикла
            for (let i = 0; i < daysLimit; i++) {
                const d = new Date(dailyData.time[i]);
                const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
                const icon = getWeatherIcon(dailyData.weather_code[i]);
                const maxT = Math.round(dailyData.temperature_2m_max[i]);
                const minT = Math.round(dailyData.temperature_2m_min[i]);
                const uvi = Math.round(dailyData.uv_index_max[i] || 0);
                
                const isSelected = (i === dayIndex);
                const bgStyle = isSelected ? 'background:rgba(255,255,255,0.15); border-radius:4px;' : '';

                html += `
                    <div style="text-align:center; min-width:48px; cursor:pointer; padding:5px; ${bgStyle} transition: background 0.2s;" onclick="window.CityDetailsPanel.updateForDay(${i})" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='${isSelected ? 'rgba(255,255,255,0.15)' : 'transparent'}'">
                        <div style="font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:5px; color:#ddd;">${dayName}</div>
                        <div style="font-size:24px; margin-bottom:5px;">${icon}</div>
                        <div style="font-size:14px; font-weight:bold;">${maxT}°</div>
                        <div style="font-size:11px; color:#888;">${minT}°</div>
                        <div style="margin-top:6px; background:#ffde33; color:#000; font-size:10px; padding:2px; border-radius:3px; font-weight:bold;">UVI ${uvi}</div>
                    </div>
                `;
            }
        }

        html += `
            </div>
            <div style="text-align:center; padding-top:15px; margin-top:20px; font-size:10px; color:#666; border-top:1px solid #444;">
                Данные предоставлены Open-Meteo API, AQICN API и OpenStreetMap API
            </div>
        `;
        contentSlot.innerHTML = html;
    }

    // объявление функции
    async function show(city, prefetchedData) {
        // проверка условия
        if (!isOpen) {
            isOpen = true;
            updateSidebarState();
        }

        contentSlot.innerHTML = `
            <div style="padding: 20px; text-align: center; color:#aaa;">
                <p>Загрузка данных для <b>${city.name}</b>...</p>
            </div>
        `;

        // начало блока перехвата ошибок
        try {
            // сбрасываем кэш без daily данных чтобы получить полный прогноз
            const cacheKey = makeDetailedCacheKey(city.lat, city.lon);
            // начало блока перехвата ошибок
            try {
                const raw = localStorage.getItem(cacheKey);
                // проверка условия
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const daily = parsed?.payload?.weather?.daily;
                    // проверка условия
                    if (!daily || !daily.time || daily.time.length === 0 || !daily.precipitation_probability_max) {
                        localStorage.removeItem(cacheKey);
                    }
                }
            } catch (_e) { localStorage.removeItem(cacheKey); }

            const data = await fetchDetailedData(city.lat, city.lon, prefetchedData);
            currentCityData = data;
            currentCityInfo = city;
            
            renderDataForDay(0);
        } catch (error) {
            contentSlot.innerHTML = `
                <div style="padding: 20px; text-align: center; color:#ff6b6b;">
                    <p><b>Ошибка загрузки данных</b></p>
                    <p style="font-size:12px;">${error.message}</p>
                </div>
            `;
        }
    }

    // объявление функции
    function clearPanel() {
        currentCityData = null;
        currentCityInfo = null;
        showEmptyState();
    }

    // возврат результата
    return {
        show: show,
        clear: clearPanel,
        updateForDay: renderDataForDay,
        open: function() { isOpen = true; updateSidebarState(); },
        close: function() { isOpen = false; updateSidebarState(); },
        isOpen: function() { return isOpen; }
    };
})();