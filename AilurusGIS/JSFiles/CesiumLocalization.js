/* * * умный скрипт мультиязычности и локализации (глубокая безотказная версия) * работает двунаправленно напрямую внедряется в knockout viewmodels cesium * полностью переписано для поддержки динамических property и mutationobserver * @param {cesiumviewer} viewer */
// объявление функции
function localizeCesiumUI(viewer) {
    let currentLang = localStorage.getItem('ailurus_lang') || 'ru';

    // экспортируем глобально чтобы другие скрипты могли вызывать вручную если нужно
    window.ailurusTranslate = function(str) {
        // возврат результата
        return translateDynamicString(str, currentLang);
    };

    //
    // 1 перехватчики api и webgl
    //
    
    // проверка условия
    if (!window._ailurusFetchPatched) {
        const originalFetch = window.fetch;
        window.fetch = async function(url, options) {
            // проверка условия
            if (typeof url === 'string' && url.includes('nominatim.openstreetmap.org')) {
                const lang = localStorage.getItem('ailurus_lang') || 'ru';
                url = url.replace(/accept-language=[a-z]+/, 'accept-language=' + lang);
            }
            // возврат результата
            return originalFetch.apply(this, arguments);
        };
        window._ailurusFetchPatched = true;
    }

    // проверка условия
    if (!window._ailurusCesiumPatched && typeof Cesium !== 'undefined' && Cesium.EntityCollection) {
        const origAdd = Cesium.EntityCollection.prototype.add;
        Cesium.EntityCollection.prototype.add = function(entityOptions) {
            const lang = localStorage.getItem('ailurus_lang') || 'ru';
            
            let origText = null;
            let origDesc = null;

            // проверка условия
            if (entityOptions && entityOptions.label && typeof entityOptions.label.text === 'string') {
                origText = entityOptions.label.text;
                entityOptions.label.text = translateDynamicString(origText, lang);
            }

            // проверка условия
            if (entityOptions && typeof entityOptions.description === 'string') {
                origDesc = entityOptions.description;
                entityOptions.description = translateDynamicString(origDesc, lang);
            }

            const addedEntity = origAdd.call(this, entityOptions);

            // проверка условия
            if (addedEntity && origText && addedEntity.label) {
                addedEntity.label._origAilurusText = origText;
            }
            // проверка условия
            if (addedEntity && origDesc) {
                addedEntity._origAilurusDesc = origDesc;
            }

            // возврат результата
            return addedEntity;
        };
        window._ailurusCesiumPatched = true;
    }

    //
    // 2 двунаправленные словари перевода
    //

    const globalDictionary = [
        // основные элементы и тултипы cesium
        { ru: 'Начальный вид', en: 'View Home', kz: 'Бастапқы көрініс' },
        { ru: 'Справка по управлению', en: 'Navigation Instructions', kz: 'Басқару анықтамасы' },
        { ru: 'Базовые карты и рельеф', en: 'Base layers & Terrain', kz: 'Негізгі карталар мен рельеф' },
        { ru: 'Введите адрес или ориентир...', en: 'Enter an address or landmark...', kz: 'Мекенжайды немесе бағдарды енгізіңіз...' },
        { ru: 'Поиск', en: 'Search', kz: 'Іздеу' },
        
        // knockout properties (заголовки меню baselayerpicker)
        { ru: 'Карты (Изображения)', en: 'Imagery', kz: 'Карталар' },
        { ru: 'Рельеф (Ландшафт)', en: 'Terrain', kz: 'Жер бедері' },
        { ru: 'Другие', en: 'Other', kz: 'Басқалар' },

        // модели карт cesium
        { ru: 'Спутник (Bing)', en: 'Bing Maps Aerial', kz: 'Жерсерік (Bing)' },
        { ru: 'Спутник + Подписи (Bing)', en: 'Bing Maps Aerial with Labels', kz: 'Жерсерік + Жазулар (Bing)' },
        { ru: 'Дороги (Bing)', en: 'Bing Maps Roads', kz: 'Жолдар (Bing)' },
        { ru: 'Спутник Sentinel-2', en: 'Sentinel-2', kz: 'Жерсерік Sentinel-2' },
        { ru: 'Blue Marble (Земля)', en: 'Blue Marble', kz: 'Көк Мәрмәр (Жер)' },
        { ru: 'Земля ночью', en: 'Earth at night', kz: 'Түндегі Жер' },
        { ru: 'Natural Earth II', en: 'Natural Earth II', kz: 'Natural Earth II' },
        
        { ru: 'Спутник (Google)', en: 'Google Satellite', kz: 'Жерсерік (Google)' },
        { ru: 'Спутник (Google)', en: 'Google Maps Satellite', kz: 'Жерсерік (Google)' },
        { ru: 'Спутник + Подписи (Google)', en: 'Google Satellite + Labels', kz: 'Жерсерік + Жазулар (Google)' },
        { ru: 'Спутник + Подписи (Google)', en: 'Google Maps Satellite with Labels', kz: 'Жерсерік + Жазулар (Google)' },
        { ru: 'Дороги (Google)', en: 'Google Roadmap', kz: 'Жолдар (Google)' },
        { ru: 'Дороги (Google)', en: 'Google Maps Roadmap', kz: 'Жолдар (Google)' },
        { ru: 'Рельеф (Google)', en: 'Google Contour', kz: 'Рельеф (Google)' },
        { ru: 'Рельеф (Google)', en: 'Google Maps Contour', kz: 'Рельеф (Google)' },
        
        { ru: 'Спутник (Azure)', en: 'Azure Aerial', kz: 'Жерсерік (Azure)' },
        { ru: 'Спутник (Azure)', en: 'Azure Maps Aerial', kz: 'Жерсерік (Azure)' },
        { ru: 'Дороги (Azure)', en: 'Azure Roads', kz: 'Жолдар (Azure)' },
        { ru: 'Дороги (Azure)', en: 'Azure Maps Roads', kz: 'Жолдар (Azure)' },
        
        { ru: 'Спутник (ArcGIS)', en: 'ArcGIS Imagery', kz: 'Жерсерік (ArcGIS)' },
        { ru: 'Спутник (ArcGIS)', en: 'ArcGIS World Imagery', kz: 'Жерсерік (ArcGIS)' },
        { ru: 'Теневой рельеф (ArcGIS)', en: 'ArcGIS Hillshade', kz: 'Көлеңкелі рельеф (ArcGIS)' },
        { ru: 'Теневой рельеф (ArcGIS)', en: 'ArcGIS World Hillshade', kz: 'Көлеңкелі рельеф (ArcGIS)' },
        { ru: 'Океаны (Esri)', en: 'Esri Oceans', kz: 'Мұхиттар (Esri)' },
        { ru: 'Океаны (Esri)', en: 'Esri World Ocean', kz: 'Мұхиттар (Esri)' },
        
        { ru: 'OpenStreetMap (Карта)', en: 'OpenStreetMap', kz: 'OpenStreetMap (Карта)' },
        { ru: 'Акварель (Stadia)', en: 'Stadia Watercolor', kz: 'Акварель (Stadia)' },
        { ru: 'Акварель (Stadia)', en: 'Stadia x Stamen Watercolor', kz: 'Акварель (Stadia)' },
        { ru: 'ЧБ Каркас (Stadia)', en: 'Stadia Toner', kz: 'Ақ-қара Каркас (Stadia)' },
        { ru: 'ЧБ Каркас (Stadia)', en: 'Stadia x Stamen Toner', kz: 'Ақ-қара Каркас (Stadia)' },
        { ru: 'Гладкая карта (Stadia)', en: 'Stadia Smooth', kz: 'Тегіс карта (Stadia)' },
        { ru: 'Гладкая карта (Stadia)', en: 'Stadia Alidade Smooth', kz: 'Тегіс карта (Stadia)' },
        { ru: 'Тёмная карта (Stadia)', en: 'Stadia Smooth Dark', kz: 'Қараңғы карта (Stadia)' },
        { ru: 'Тёмная карта (Stadia)', en: 'Stadia Alidade Smooth Dark', kz: 'Қараңғы карта (Stadia)' },
        
        { ru: 'Мировой рельеф (Cesium)', en: 'Cesium World Terrain', kz: 'Әлемдік рельеф (Cesium)' },
        { ru: 'Гладкий эллипсоид WGS84', en: 'WGS84 Ellipsoid', kz: 'Тегіс эллипсоид WGS84' },

        // кастомный интерфейс и инструменты
        { ru: 'Батиметрия (Рельеф морского дна)', en: 'Bathymetry (Seafloor Relief)', kz: 'Батиметрия (Теңіз түбі бедері)' },
        { ru: 'Батиметрия (Вкл)', en: 'Bathymetry (On)', kz: 'Батиметрия (Қосулы)' },
        { ru: 'Батиметрия (Выкл)', en: 'Bathymetry (Off)', kz: 'Батиметрия (Өшірулі)' },
        { ru: 'Тектонические плиты', en: 'Tectonic Plates', kz: 'Тектоникалық плиталар' },
        { ru: 'Землетрясения (за 7 дней)', en: 'Earthquakes (Last 7 Days)', kz: 'Жер сілкіністері (7 күн)' },
        { ru: 'Радар осадков', en: 'Precipitation Radar', kz: 'Жауын-шашын радары' },
        { ru: 'Спутники (все активные)', en: 'Satellites (All Active)', kz: 'Жерсеріктер (барлық белсенді)' },
        { ru: 'Спутники Starlink', en: 'Starlink Satellites', kz: 'Starlink жерсеріктері' },
        { ru: 'День и ночь', en: 'Day and Night', kz: 'Күн мен түн' },
        { ru: '3D Здания', en: '3D Buildings', kz: '3D Ғимараттар' },
        { ru: 'Реки мира', en: 'World Rivers', kz: 'Әлем өзендері' },
        { ru: 'Закладки на карте', en: 'Map Bookmarks', kz: 'Картадағы бетбелгілер' },
        { ru: 'Границы стран (KML)', en: 'Country Borders (KML)', kz: 'Ел шекаралары (KML)' },
        { ru: 'Границы стран KML (Вкл)', en: 'Country Borders KML (On)', kz: 'Ел шекаралары KML (Қосулы)' },
        { ru: 'Границы стран KML (Выкл)', en: 'Country Borders KML (Off)', kz: 'Ел шекаралары KML (Өшірулі)' },
        { ru: 'Улучшенные границы стран (GeoJSON)', en: 'Improved Country Borders (GeoJSON)', kz: 'Жақсартылған ел шекаралары (GeoJSON)' },
        { ru: 'Улучшенные границы стран GeoJSON (Вкл)', en: 'Improved Country Borders GeoJSON (On)', kz: 'Жақсартылған ел шекаралары GeoJSON (Қосулы)' },
        { ru: 'Улучшенные границы стран GeoJSON (Выкл)', en: 'Improved Country Borders GeoJSON (Off)', kz: 'Жақсартылған ел шекаралары GeoJSON (Өшірулі)' },
        { ru: 'Станции качества воздуха (AQI)', en: 'Air Quality Stations (AQI)', kz: 'Ауа сапасы станциялары (AQI)' },
        { ru: 'Тепловая карта температур', en: 'Temperature Heatmap', kz: 'Температура жылу картасы' },
        { ru: 'Карта качества воздуха', en: 'Air Quality Map', kz: 'Ауа сапасының картасы' },
        { ru: 'Анимация ветра', en: 'Wind Animation', kz: 'Жел анимациясы' },
        { ru: 'Музыка ВКЛ', en: 'Music ON', kz: 'Музыка ҚОСУЛЫ' },
        { ru: 'Музыка ВЫКЛ', en: 'Music OFF', kz: 'Музыка ӨШІРУЛІ' },
        { ru: 'Выбор языка / Language', en: 'Language Selection', kz: 'Тілді таңдау' },
        { ru: 'Поиск по всему миру...', en: 'Search the world...', kz: 'Бүкіл әлем бойынша іздеу...' },
        { ru: 'Управление временем', en: 'Time Control', kz: 'Уақытты басқару' },
        { ru: 'Менеджер закладок', en: 'Bookmark Manager', kz: 'Бетбелгілер менеджері' },
        { ru: 'Название метки...', en: 'Label name...', kz: 'Белгі атауы...' },
        { ru: 'Инструкция:', en: 'Instructions:', kz: 'Нұсқаулық:' },
        { ru: 'Экспорт', en: 'Export', kz: 'Экспорт' },
        { ru: 'Импорт', en: 'Import', kz: 'Импорт' },
        { ru: 'Скрыть город', en: 'Hide City', kz: 'Қаланы жасыру' },
        { ru: 'Ничего не найдено', en: 'Nothing found', kz: 'Ештеңе табылмады' },
        { ru: 'Поиск...', en: 'Searching...', kz: 'Іздеу...' },
        { ru: 'Сейчас', en: 'Now', kz: 'Қазір' },
        { ru: 'Высота / Глубина', en: 'Height / Depth', kz: 'Биіктік / Тереңдік' },
        { ru: 'Настройки (Options)', en: 'Settings (Options)', kz: 'Баптаулар (Options)' },
        { ru: 'Усиление рельефа:', en: 'Terrain Exaggeration:', kz: 'Жер бедерін күшейту:' },
        { ru: 'Освещение рельефа', en: 'Terrain Lighting', kz: 'Жер бедерін жарықтандыру' },
        { ru: 'Атмосфера и туман', en: 'Atmosphere and Fog', kz: 'Атмосфера және тұман' },
        { ru: 'Цветовая шкала глубин', en: 'Depth Color Scale', kz: 'Тереңдіктің түс шкаласы' },
        { ru: 'Контурные линии', en: 'Contour Lines', kz: 'Контур сызықтары' },
        { ru: 'Светлые контуры', en: 'Light Contours', kz: 'Жарық контурлар' },
        { ru: 'Отключить шейдеры', en: 'Disable shaders', kz: 'Шейдерлерді өшіру' },
        { ru: 'Включить шейдеры', en: 'Enable shaders', kz: 'Шейдерлерді қосу' },
        { ru: 'Уровень осадков (мм/ч)', en: 'Precipitation level (mm/h)', kz: 'Жауын-шашын деңгейі (мм/сағ)' },
        { ru: 'Слабый дождь', en: 'Light rain', kz: 'Аздаған жаңбыр' },
        { ru: 'Умеренный дождь', en: 'Moderate rain', kz: 'Орташа жаңбыр' },
        { ru: 'Сильный дождь', en: 'Heavy rain', kz: 'Қатты жаңбыр' },
        { ru: 'Экстремальный ливень', en: 'Extreme downpour', kz: 'Экстремалды нөсер' },
        { ru: 'Град или Снег', en: 'Hail or Snow', kz: 'Бұршақ немесе Қар' },
        { ru: 'Без лимита', en: 'Unlimited', kz: 'Шектеусіз' },
        { ru: 'Режим 60 FPS (нажмите для смены)', en: '60 FPS mode (click to change)', kz: '60 FPS режимі (өзгерту үшін басыңыз)' },
        { ru: 'Режим 30 FPS (нажмите для смены)', en: '30 FPS mode (click to change)', kz: '30 FPS режимі (өзгерту үшін басыңыз)' },
        { ru: 'Без ограничения FPS (нажмите для смены)', en: 'Unlimited FPS (click to change)', kz: 'FPS шектеусіз (өзгерту үшін басыңыз)' },
        { ru: 'Неизвестно', en: 'Unknown', kz: 'Белгісіз' },
        { ru: 'АУА РАЙЫ АҚПАРАТЫ', en: 'WEATHER INFORMATION', kz: 'АУА РАЙЫ АҚПАРАТЫ' },
        { ru: 'ИНФОРМАЦИЯ О ПОГОДЕ', en: 'WEATHER INFORMATION', kz: 'АУА РАЙЫ АҚПАРАТЫ' },
        { ru: 'ПРОГНОЗ (5 ДНЕЙ)', en: 'FORECAST (5 DAYS)', kz: 'БОЛЖАМ (5 КҮН)' },
        { ru: 'сейчас', en: 'now', kz: 'қазір' },
        { ru: 'Темп.', en: 'Temp.', kz: 'Темп.' },
        { ru: 'Влажн.', en: 'Humid.', kz: 'Ылғал.' },
        { ru: 'Осадки', en: 'Precip.', kz: 'Жауын' },
        { ru: 'Ветер', en: 'Wind', kz: 'Жел' },

        // панель погоды и данные (новые фразы)
        { ru: 'Выберите город в поиске выше для просмотра погодных данных и качества воздуха.', en: 'Select a city in the search above to view weather data and air quality.', kz: 'Ауа райы және ауа сапасы деректерін көру үшін жоғарыдағы іздеуден қаланы таңдаңыз.' },
        { ru: 'Данные предоставлены Open-Meteo API, AQICN API и OpenStreetMap API', en: 'Data provided by Open-Meteo API, AQICN API, and OpenStreetMap API', kz: 'Деректерді Open-Meteo API, AQICN API және OpenStreetMap API ұсынған' },
        { ru: 'Детальные данные по загрязнителям недоступны для долгосрочного прогноза. Отображается только средний дневной AQI (при наличии).', en: 'Detailed pollutant data is not available for long-term forecasts. Only the average daily AQI is shown (if available).', kz: 'Ластаушы заттар туралы толық мәліметтер ұзақ мерзімді болжам үшін қолжетімсіз. Тек орташа тәуліктік АСИ (AQI) көрсетіледі (егер бар болса).' },

        // дни недели для прогноза погоды (учитываем возможные варианты регистра)
        { ru: 'ПН', en: 'MON', kz: 'ДС' },
        { ru: 'ВТ', en: 'TUE', kz: 'СС' },
        { ru: 'СР', en: 'WED', kz: 'СР' },
        { ru: 'ЧТ', en: 'THU', kz: 'БС' },
        { ru: 'ПТ', en: 'FRI', kz: 'ЖМ' },
        { ru: 'СБ', en: 'SAT', kz: 'СН' },
        { ru: 'ВС', en: 'SUN', kz: 'ЖС' },
        { ru: 'Пн', en: 'Mon', kz: 'Дс' },
        { ru: 'Вт', en: 'Tue', kz: 'Сс' },
        { ru: 'Ср', en: 'Wed', kz: 'Ср' },
        { ru: 'Чт', en: 'Thu', kz: 'Бс' },
        { ru: 'Пт', en: 'Fri', kz: 'Жм' },
        { ru: 'Сб', en: 'Sat', kz: 'Сн' },
        { ru: 'Вс', en: 'Sun', kz: 'Жс' },
        { ru: 'пн', en: 'mon', kz: 'дс' },
        { ru: 'вт', en: 'tue', kz: 'сс' },
        { ru: 'ср', en: 'wed', kz: 'ср' },
        { ru: 'чт', en: 'thu', kz: 'бс' },
        { ru: 'пт', en: 'fri', kz: 'жм' },
        { ru: 'сб', en: 'sat', kz: 'сн' },
        { ru: 'вс', en: 'sun', kz: 'жс' },

        // инструкция по управлению (cesium navigation help)
        { ru: 'ЛКМ + перетаскивание', en: 'Left click + drag', kz: 'Сол жақ батырма + сүйреу' },
        { ru: 'ПКМ + перетаскивание, или', en: 'Right click + drag, or', kz: 'Оң жақ батырма + сүйреу, немесе' },
        { ru: 'Прокрутка колесиком', en: 'Mouse wheel scroll', kz: 'Дөңгелекті айналдыру' },
        { ru: 'СКМ + перетаскивание, или', en: 'Middle click + drag, or', kz: 'Ортаңғы батырма + сүйреу, немесе' },
        { ru: 'CTRL + ЛКМ/ПКМ + перетаскивание', en: 'CTRL + Left/Right click + drag', kz: 'CTRL + Сол/Оң батырма + сүйреу' },
        { ru: 'Свайп одним пальцем', en: 'One finger drag', kz: 'Бір саусақпен сырғыту' },
        { ru: 'Щипок двумя пальцами', en: 'Two finger pinch', kz: 'Екі саусақпен қысу' },
        { ru: 'Свайп двумя пальцами', en: 'Two finger drag, same direction', kz: 'Екі саусақпен сырғыту' },
        { ru: 'Вращение двумя пальцами', en: 'Two finger drag, opposite direction', kz: 'Екі саусақпен бұру' },
        { ru: 'Перемещение', en: 'Pan view', kz: 'Жылжыту' },
        { ru: 'Масштаб', en: 'Zoom view', kz: 'Масштаб' },
        { ru: 'Вращение', en: 'Rotate view', kz: 'Бұру' },
        { ru: 'Наклон', en: 'Tilt view', kz: 'Еңкейту' },
        { ru: 'Мышь', en: 'Mouse', kz: 'Тінтуір' },
        { ru: 'Сенсор', en: 'Touch', kz: 'Сенсор' },

        // полноэкранный режим
        { ru: 'Полный экран', en: 'Fullscreen', kz: 'Толық экран' },
        { ru: 'Развернуть на весь экран', en: 'Enter fullscreen', kz: 'Толық экранға шығу' },
        { ru: 'Свернуть с полного экрана', en: 'Exit fullscreen', kz: 'Толық экраннан шығу' },
        { ru: 'На весь экран', en: 'Full Screen', kz: 'Толық экран' },
        { ru: 'Выйти из полного экрана', en: 'Exit Full Screen', kz: 'Толық экраннан шығу' },

        // режимы проекции
        { ru: 'Перспектива', en: 'Perspective', kz: 'Перспектива' },
        { ru: 'Ортографический', en: 'Orthographic', kz: 'Ортографиялық' },
        { ru: 'Переключить проекцию', en: 'Toggle projection', kz: 'Проекцияны ауыстыру' },
        { ru: 'Режим вида', en: 'View mode', kz: 'Көру режимі' },
        { ru: '3D вид', en: '3D view', kz: '3D көрініс' },
        { ru: '2D вид', en: '2D view', kz: '2D көрініс' },
        { ru: 'Режим Колумба', en: 'Columbus View', kz: 'Колумб Көрінісі' },

        // анимация/хронология
        { ru: 'Воспроизведение', en: 'Play', kz: 'Ойнату' },
        { ru: 'Пауза', en: 'Pause', kz: 'Үзіліс' },
        { ru: 'Остановить', en: 'Stop', kz: 'Тоқтату' },
        { ru: 'Увеличить скорость', en: 'Increase speed', kz: 'Жылдамдықты арттыру' },
        { ru: 'Уменьшить скорость', en: 'Decrease speed', kz: 'Жылдамдықты азайту' },

        // прочие кнопки cesium
        { ru: 'Справка', en: 'Help', kz: 'Анықтама' },
        { ru: 'Инструкции по навигации', en: 'Navigation Instructions', kz: 'Навигация нұсқаулары' },
        { ru: 'Нажмите и перетащите для панорамирования', en: 'Click and drag to pan', kz: 'Жылжыту үшін басып сүйреңіз' },
        { ru: 'Зажмите правую кнопку и перетащите для вращения', en: 'Right click and drag to rotate', kz: 'Бұру үшін оң жақ батырманы басып сүйреңіз' },
        { ru: 'Колесо мыши для масштабирования', en: 'Mouse wheel to zoom', kz: 'Масштабтау үшін тінтуір дөңгелегін айналдырыңыз' },
        { ru: 'Базовые карты', en: 'Imagery', kz: 'Карталар' },
        { ru: 'Рельеф', en: 'Terrain', kz: 'Жер бедері' },
        { ru: 'Нет рельефа', en: 'No terrain', kz: 'Жер бедері жоқ' },
        { ru: 'Выбор базовой карты', en: 'Choose a base map', kz: 'Негізгі картаны таңдаңыз' },
        { ru: 'Выбор рельефа', en: 'Choose terrain', kz: 'Жер бедерін таңдаңыз' },

        // инструкция poi manager
        { ru: 'Цвет', en: 'Color', kz: 'Түс' },
        { ru: '1. Введите текст и выберите цвет.', en: '1. Enter text and pick color.', kz: '1. Мәтін енгізіп, түс таңдаңыз.' },
        { ru: '2. Левый клик по карте — поставить метку.', en: '2. Left click on map — place pin.', kz: '2. Картада сол жақ батырма — белгі қою.' },
        { ru: '3. Правый клик по метке — удалить её.', en: '3. Right click on pin — delete it.', kz: '3. Оң жақ батырма — белгіні өшіру.' },
        // фрагменты инструкции если текстовые узлы разбиты html тегами (<b>)
        { ru: 'по карте — поставить метку.', en: 'on map — place pin.', kz: 'картада — белгі қою.' },
        { ru: 'по метке — удалить её.', en: 'on pin — delete it.', kz: 'белгіні — өшіру.' },

        // радары
        { ru: 'Внимание:', en: 'Attention:', kz: 'Назар аударыңыз:' },
        { ru: 'Наземные доплеровские радары', en: 'Ground Doppler radars', kz: 'Жерүсті доплерлік радарлар' },
        { ru: 'недоступны в некоторых странах (напр. РФ)', en: 'are unavailable in some countries (e.g. RF)', kz: 'кейбір елдерде қолжетімсіз (мысалы, РФ)' },
        { ru: 'из-за ограничений метеослужб.', en: 'due to meteorological services restrictions.', kz: 'метеорологиялық қызметтердің шектеулеріне байланысты.' },

        { ru: 'В базе нет данных (0 рек). Проверьте файл базы данных!', en: 'No data in DB (0 rivers). Check the database file!', kz: 'Базада деректер жоқ (0 өзен). Дерекқор файлын тексеріңіз!' },
        { ru: 'Новая метка', en: 'New pin', kz: 'Жаңа белгі' },
        { ru: 'Ошибка сохранения метки!', en: 'Error saving pin!', kz: 'Белгіні сақтау қатесі!' },
        { ru: 'Ошибка удаления метки!', en: 'Error deleting pin!', kz: 'Белгіні жою қатесі!' }
    ];

    const partialDictionary = [
        // длинные комплексные фразы должны быть первыми чтобы короткие слова (например "ветер") не сломали их
        { ru: 'Ветер откуда:', en: 'Wind from:', kz: 'Жел бағыты:' },
        { ru: 'Ветер куда:', en: 'Wind to:', kz: 'Жел қайда:' },
        { ru: 'Спутник:', en: 'Satellite:', kz: 'Жерсерік:' },
        { ru: 'Высота:', en: 'Altitude:', kz: 'Биіктік:' },
        { ru: 'Магнитуда:', en: 'Magnitude:', kz: 'Магнитудасы:' },
        { ru: 'Глубина:', en: 'Depth:', kz: 'Тереңдігі:' },
        { ru: 'Место:', en: 'Location:', kz: 'Орны:' },
        { ru: 'Время:', en: 'Time:', kz: 'Уақыты:' },
        { ru: 'AQI:', en: 'AQI:', kz: 'АСИ (AQI):' },
        { ru: 'ИКВ (AQI)', en: 'AQI', kz: 'АСИ (AQI)' },
        { ru: ' км', en: ' km', kz: ' км' },
        
        { ru: 'Левый клик', en: 'Left click', kz: 'Сол жақ батырма' },
        { ru: 'Правый клик', en: 'Right click', kz: 'Оң жақ батырма' },
        { ru: 'Тап', en: 'Tap', kz: 'Түрту' },

        { ru: 'ЗАГРУЗКА ДАННЫХ...', en: 'UPLOADING DATA...', kz: 'ДЕРЕКТЕРДІ ЖҮКТЕУ...' },
        { ru: 'Загрузка всех спутников...', en: 'Loading all satellites...', kz: 'Барлық жерсеріктерді жүктеу...' },
        { ru: 'Загрузка радара осадков...', en: 'Loading Precipitation Radar...', kz: 'Жауын-шашын радарын жүктеу...' },
        { ru: 'Генерация погодной тепловой карты...', en: 'Generating weather heatmap...', kz: 'Ауа-райы жылу картасын жасау...' },
        { ru: 'Генерация карты AQI...', en: 'Generating AQI heatmap...', kz: 'AQI жылу картасын жасау...' },
        { ru: 'Загрузка AQI (весь мир)...', en: 'Loading AQI (World)...', kz: 'AQI жүктеу (Әлем)...' },
        { ru: 'Инициализация данных о ветре...', en: 'Initializing wind data...', kz: 'Жел деректерін іске қосу...' },
        { ru: 'Загрузка Custom Границ...', en: 'Loading Custom Borders...', kz: 'Пайдаланушы шекараларын жүктеу...' },
        { ru: 'Загрузка улучшенных GeoJSON границ стран...', en: 'Loading improved country GeoJSON borders...', kz: 'Жақсартылған ел шекаралары GeoJSON жүктелуде...' },
        { ru: 'Загрузка батиметрии дна...', en: 'Loading bathymetry...', kz: 'Батиметрияны жүктеу...' },
        { ru: 'Загрузка разломов...', en: 'Loading fault lines...', kz: 'Жарықтарды жүктеу...' },
        { ru: 'Загрузка Starlink...', en: 'Loading Starlink...', kz: 'Starlink жүктеу...' },
        { ru: 'Загрузка 3D Зданий...', en: 'Loading 3D Buildings...', kz: '3D Ғимараттарды жүктеу...' },
        { ru: 'Загрузка рек из базы...', en: 'Loading rivers from DB...', kz: 'Базадан өзендерді жүктеу...' },
        { ru: 'Загрузка данных USGS...', en: 'Loading USGS data...', kz: 'USGS деректерін жүктеу...' },
        { ru: 'Импорт закладок...', en: 'Importing bookmarks...', kz: 'Бетбелгілерді импорттау...' },
        { ru: 'Загрузка данных для', en: 'Loading data for', kz: 'Деректер жүктелуде:' },
        { ru: 'Загрузка...', en: 'Loading...', kz: 'Жүктелуде...' },
        { ru: 'Не удалось загрузить слой 3D Зданий. Ошибка:', en: 'Failed to load 3D Buildings layer. Error:', kz: '3D Ғимараттар қабатын жүктеу мүмкін болмады. Қате:' },

        { ru: 'Текущие данные', en: 'Current Data', kz: 'Ағымдағы деректер' },
        { ru: 'Прогноз AQI (24 часа)', en: 'AQI Forecast (24h)', kz: 'AQI Болжамы (24 сағ)' },
        { ru: 'Прогноз на весь день', en: 'Full day forecast', kz: 'Күні бойы болжам' },
        { ru: 'Прогноз на', en: 'Forecast for', kz: 'Болжам:' },
        { ru: 'Обновлено в', en: 'Updated on', kz: 'Жаңартылды:' },
        
        { ru: 'Северный', en: 'North', kz: 'Солтүстік' },
        { ru: 'Восточный', en: 'East', kz: 'Шығыс' },
        { ru: 'Южный', en: 'South', kz: 'Оңтүстік' },
        { ru: 'Западный', en: 'West', kz: 'Батыс' },

        { ru: 'С-В', en: 'NE', kz: 'С-Ш' },
        { ru: 'Ю-В', en: 'SE', kz: 'О-Ш' },
        { ru: 'Ю-З', en: 'SW', kz: 'О-Б' },
        { ru: 'С-З', en: 'NW', kz: 'С-Б' },

        { ru: 'Ясно', en: 'Clear', kz: 'Ашық' },
        { ru: 'В основном ясно', en: 'Mostly clear', kz: 'Негізінен ашық' },
        { ru: 'Переменная облачность', en: 'Partly cloudy', kz: 'Ауыспалы бұлттылық' },
        { ru: 'Пасмурно', en: 'Overcast', kz: 'Бұлтты' },
        { ru: 'Туман', en: 'Fog', kz: 'Тұман' },
        { ru: 'Оседающий туман', en: 'Depositing rime fog', kz: 'Түсетін тұман' },
        { ru: 'Легкая морось', en: 'Light drizzle', kz: 'Жеңіл сіркіреу' },
        { ru: 'Умеренная морось', en: 'Moderate drizzle', kz: 'Орташа сіркіреу' },
        { ru: 'Густая морось', en: 'Dense drizzle', kz: 'Қалың сіркіреу' },
        { ru: 'Легкая ледяная морось', en: 'Light freezing drizzle', kz: 'Жеңіл мұзды сіркіреу' },
        { ru: 'Густая ледяная морось', en: 'Dense freezing drizzle', kz: 'Қалың мұзды сіркіреу' },
        { ru: 'Слабый дождь', en: 'Slight rain', kz: 'Аздаған жаңбыр' },
        { ru: 'Умеренный дождь', en: 'Moderate rain', kz: 'Орташа жаңбыр' },
        { ru: 'Сильный дождь', en: 'Heavy rain', kz: 'Қатты жаңбыр' },
        { ru: 'Слабый ледяной дождь', en: 'Light freezing rain', kz: 'Аздаған мұзды жаңбыр' },
        { ru: 'Сильный ледяной дождь', en: 'Heavy freezing rain', kz: 'Қатты мұзды жаңбыр' },
        { ru: 'Слабый снег', en: 'Slight snow fall', kz: 'Аздаған қар' },
        { ru: 'Умеренный снег', en: 'Moderate snow fall', kz: 'Орташа қар' },
        { ru: 'Сильный снегопад', en: 'Heavy snow fall', kz: 'Қатты қар' },
        { ru: 'Снежные зерна', en: 'Snow grains', kz: 'Қар түйіршіктері' },
        { ru: 'Слабый ливень', en: 'Slight rain showers', kz: 'Аздаған нөсер' },
        { ru: 'Умеренный ливень', en: 'Moderate rain showers', kz: 'Орташа нөсер' },
        { ru: 'Сильный ливень', en: 'Violent rain showers', kz: 'Қатты нөсер' },
        { ru: 'Слабый снегопад', en: 'Slight snow showers', kz: 'Аздаған қар жаууы' },
        { ru: 'Гроза с градом', en: 'Thunderstorm with hail', kz: 'Бұршақпен найзағай' },
        { ru: 'Сильная гроза с градом', en: 'Heavy thunderstorm with hail', kz: 'Бұршақпен қатты найзағай' },
        { ru: 'Гроза', en: 'Thunderstorm', kz: 'Найзағай' },
        
        { ru: 'Хорошо', en: 'Good', kz: 'Жақсы' },
        { ru: 'Умеренно', en: 'Moderate', kz: 'Қалыпты' },
        { ru: 'Вредно чувствит.', en: 'Unhealthy for Sensitive', kz: 'Сезімталдарға зиянды' },
        { ru: 'Чувствит.', en: 'Sensitive', kz: 'Сезімтал' },
        { ru: 'Очень вредно', en: 'Very Unhealthy', kz: 'Өте зиянды' },
        { ru: 'Вредно', en: 'Unhealthy', kz: 'Зиянды' },
        { ru: 'Опасно', en: 'Hazardous', kz: 'Қауіпті' },
        { ru: 'Нет данных', en: 'No data', kz: 'Деректер жоқ' },
        { ru: ' (ср.)', en: ' (avg.)', kz: ' (орт.)' },
        { ru: ' (осад.)', en: ' (precip.)', kz: ' (жауын)' },
        { ru: ' (макс)', en: ' (max)', kz: ' (макс)' },

        { ru: 'Данные из кэша', en: 'Cached data', kz: 'Кэштегі деректер' },
        
        { ru: 'км/ч', en: 'km/h', kz: 'км/сағ' },
        
        { ru: 'Анимация (1 сек = 1 час)', en: 'Animation (1 sec = 1 hour)', kz: 'Анимация (1 сек = 1 сағат)' },

        { ru: 'понедельник', en: 'Monday', kz: 'Дүйсенбі' },
        { ru: 'вторник', en: 'Tuesday', kz: 'Сейсенбі' },
        { ru: 'среда', en: 'Wednesday', kz: 'Сәрсенбі' },
        { ru: 'четверг', en: 'Thursday', kz: 'Бейсенбі' },
        { ru: 'пятница', en: 'Friday', kz: 'Жұма' },
        { ru: 'суббота', en: 'Saturday', kz: 'Сенбі' },
        { ru: 'воскресенье', en: 'Sunday', kz: 'Жексенбі' },

        { ru: 'января', en: 'January', kz: 'Қаңтар' },
        { ru: 'февраля', en: 'February', kz: 'Ақпан' },
        { ru: 'марта', en: 'March', kz: 'Наурыз' },
        { ru: 'апреля', en: 'April', kz: 'Сәуір' },
        { ru: 'мая', en: 'May', kz: 'Мамыр' },
        { ru: 'июня', en: 'June', kz: 'Маусым' },
        { ru: 'июля', en: 'July', kz: 'Шілде' },
        { ru: 'августа', en: 'August', kz: 'Тамыз' },
        { ru: 'сентября', en: 'September', kz: 'Қыркүйек' },
        { ru: 'октября', en: 'October', kz: 'Қазан' },
        { ru: 'ноября', en: 'November', kz: 'Қараша' },
        { ru: 'декабря', en: 'December', kz: 'Желтоқсан' },

        { ru: 'Ошибка БД:', en: 'DB Error:', kz: 'ДҚ қатесі:' }
    ];

    // обязательная сортировка словаря частичных замен (длинные фразы обрабатываются первыми)
    // это исключит баги вроде замены "ветер" внутри "ветер откуда:"
    partialDictionary.sort((a, b) => b.ru.length - a.ru.length);

    const regexRules = [
        {
            ru: /([-+]?\d+(?:\.\d+)?)ч/g,
            en: /([-+]?\d+(?:\.\d+)?)h/g,
            kz: /([-+]?\d+(?:\.\d+)?)сағ/g,
            replace: { ru: '$1ч', en: '$1h', kz: '$1сағ' }
        }
    ];

    //
    // 3 умное двунаправленное ядро перевода
    //

    // объявление функции
    function translateDynamicString(str, targetLang) {
        // проверка условия
        if (!str || typeof str !== 'string') return str;
        const trimmed = str.trim();
        // проверка условия
        if (!trimmed) return str;
        
        // начало цикла
        for (const entry of globalDictionary) {
            // проверка условия
            if (trimmed === entry.ru || trimmed === entry.en || trimmed === entry.kz) {
                // возврат результата
                return str.replace(trimmed, entry[targetLang]);
            }
        }
        
        let result = str;
        // начало цикла
        for (const entry of partialDictionary) {
            const targetPhrase = entry[targetLang];
            // проверка условия
            if (result.includes(entry.ru)) result = result.split(entry.ru).join(targetPhrase);
            else if (result.includes(entry.en)) result = result.split(entry.en).join(targetPhrase);
            else if (result.includes(entry.kz)) result = result.split(entry.kz).join(targetPhrase);
        }

        // начало цикла
        for (const rule of regexRules) {
            const targetFormat = rule.replace[targetLang];
            // проверка условия
            if (rule.ru.test(result)) result = result.replace(rule.ru, targetFormat);
            else if (rule.en.test(result)) result = result.replace(rule.en, targetFormat);
            else if (rule.kz.test(result)) result = result.replace(rule.kz, targetFormat);
            
            rule.ru.lastIndex = 0; rule.en.lastIndex = 0; rule.kz.lastIndex = 0;
        }

        // возврат результата
        return result;
    }

    //
    // 4 глубокая интеграция в cesium knockout viewmodels
    //
    function updateKnockoutModels() {
        const t = currentLang;

        const safeTranslateVM = (vm, key) => {
            // проверка условия
            if (!vm || vm[key] === undefined) return;
            const current = typeof vm[key] === 'function' ? vm[key]() : vm[key];
            // проверка условия
            if (current === undefined || current === null || current === '') return;
            
            const origKey = `_origAilurus_${key}`;
            // проверка условия
            if (!vm[origKey]) vm[origKey] = current; 
            
            const translated = translateDynamicString(vm[origKey], t);
            
            // проверка условия
            if (current !== translated) {
                // проверка условия
                if (typeof vm[key] === 'function') vm[key](translated); 
                else vm[key] = translated;
            }
        };

        // проверка условия
        if (viewer.homeButton) safeTranslateVM(viewer.homeButton.viewModel, 'tooltip');
        // проверка условия
        if (viewer.navigationHelpButton) safeTranslateVM(viewer.navigationHelpButton.viewModel, 'tooltip');
        
        // проверка условия
        if (viewer.baseLayerPicker) {
            const vm = viewer.baseLayerPicker.viewModel;
            safeTranslateVM(vm, 'buttonTooltip');
            safeTranslateVM(vm, 'imageryTitle');
            safeTranslateVM(vm, 'terrainTitle');
            
            const updateProviders = (collection) => {
                // проверка условия
                if (!collection) return;
                const items = typeof collection === 'function' ? collection() : collection;
                // проверка условия
                if (!Array.isArray(items)) return;

                items.forEach(model => {
                    safeTranslateVM(model, 'name');     
                    safeTranslateVM(model, 'tooltip');  
                    safeTranslateVM(model, 'category'); 
                });
            };
            
            updateProviders(vm.imageryProviderViewModels);
            updateProviders(vm.terrainProviderViewModels);
        }
        
        // проверка условия
        if (viewer.fullscreenButton) safeTranslateVM(viewer.fullscreenButton.viewModel, 'tooltip');
    }

    //
    // 5 ui панель перевода (с плавной анимацией)
    //
    
    let container = document.getElementById('leftBottomControls');
    // проверка условия
    if (!container) {
        container = document.createElement('div');
        container.id = 'leftBottomControls';
        container.style.position = 'absolute';
        container.style.bottom = '30px';
        container.style.left = '15px';
        container.style.zIndex = '1000';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.alignItems = 'center';
        viewer.container.appendChild(container);
    }

    const langBtnWrapper = document.createElement('div');
    langBtnWrapper.style.position = 'relative';
    langBtnWrapper.style.order = '100'; 

    const btnLang = document.createElement('button');
    btnLang.className = 'cesium-button cesium-toolbar-button';
    btnLang.style.width = '30px';
    btnLang.style.height = '30px';
    btnLang.style.padding = '0';
    btnLang.style.display = 'flex';
    btnLang.style.justifyContent = 'center';
    btnLang.style.alignItems = 'center';
    btnLang.title = 'Выбор языка / Language';

    const iconLang = document.createElement('img');
    iconLang.src = 'Sprites/Icons/Language.png';
    iconLang.style.width = '20px';
    iconLang.style.height = '20px';
    btnLang.appendChild(iconLang);
    langBtnWrapper.appendChild(btnLang);

    const langPanel = document.createElement('div');
    langPanel.style.position = 'absolute';
    langPanel.style.bottom = '0px'; 
    langPanel.style.left = '40px'; 
    langPanel.style.backgroundColor = 'rgba(38, 40, 42, 0.95)';
    langPanel.style.border = '1px solid #555';
    langPanel.style.borderRadius = '4px';
    langPanel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    langPanel.style.overflow = 'hidden';
    langPanel.style.zIndex = '2000';
    langPanel.style.width = 'auto'; 
    
    // на мобильных открываем панель выше кнопки чтобы не перекрывать её
    const _isMobileLang = window.AilurusIsMobile ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        window.innerWidth <= 768;
    // проверка условия
    if (_isMobileLang) {
        langPanel.style.bottom = 'calc(100% + 6px)';
        langPanel.style.left = '0px';
        langPanel.style.top = 'auto';
    }
    
    // плавное появление
    langPanel.style.display = 'flex';
    langPanel.style.flexDirection = 'row'; 
    langPanel.style.opacity = '0';
    langPanel.style.pointerEvents = 'none';
    langPanel.style.transform = 'translateY(5px)';
    langPanel.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    
    langBtnWrapper.appendChild(langPanel);

    ['ru', 'en', 'kz'].forEach((code, index, arr) => {
        const item = document.createElement('div');
        item.textContent = code.toUpperCase();
        item.style.padding = '7px 12px';
        item.style.color = '#fff';
        item.style.fontSize = '13px';
        item.style.fontWeight = 'bold';
        item.style.cursor = 'pointer';
        
        // проверка условия
        if (index < arr.length - 1) item.style.borderRight = '1px solid #444';
        
        item.onmouseover = () => item.style.backgroundColor = '#3071a9';
        item.onmouseout = () => item.style.backgroundColor = currentLang === code ? 'rgba(48, 113, 169, 0.5)' : 'transparent';
        // проверка условия
        if (currentLang === code) item.style.backgroundColor = 'rgba(48, 113, 169, 0.5)';

        item.onclick = () => {
            currentLang = code;
            localStorage.setItem('ailurus_lang', currentLang);
            
            // плавное скрытие
            langPanel.style.opacity = '0';
            langPanel.style.pointerEvents = 'none';
            langPanel.style.transform = 'translateY(5px)';
            btnLang.style.backgroundColor = '';
            
            Array.from(langPanel.children).forEach(child => child.style.backgroundColor = 'transparent');
            item.style.backgroundColor = 'rgba(48, 113, 169, 0.5)';
            
            applyTranslations(); 
        };
        langPanel.appendChild(item);
    });

    container.appendChild(langBtnWrapper);

    btnLang.addEventListener('click', () => {
        const isHidden = langPanel.style.opacity === '0';
        langPanel.style.opacity = isHidden ? '1' : '0';
        langPanel.style.pointerEvents = isHidden ? 'auto' : 'none';
        langPanel.style.transform = isHidden ? 'translateY(0)' : 'translateY(5px)';
        btnLang.style.backgroundColor = isHidden ? 'rgba(38, 84, 121, 1)' : '';
    });

    document.addEventListener('click', (e) => {
        // проверка условия
        if (!langBtnWrapper.contains(e.target)) {
            langPanel.style.opacity = '0';
            langPanel.style.pointerEvents = 'none';
            langPanel.style.transform = 'translateY(5px)';
            btnLang.style.backgroundColor = '';
        }
    });

    //
    // 6 глобальный переводчик dom узлов и cesium webgl
    //
    
    // объявление функции
    function translateDOMNodes(node) {
        // проверка условия
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.nodeValue;
            // проверка условия
            if (!text || !text.trim()) return;
            
            let parent = node.parentElement;
            // проверка условия
            if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;

            // проверка условия
            if (node._origAilurusText === undefined || (node._lastTranslatedText && text !== node._lastTranslatedText)) {
                node._origAilurusText = text;
            }

            const orig = node._origAilurusText;
            const translated = translateDynamicString(orig, currentLang);
            // проверка условия
            if (text !== translated) {
                node.nodeValue = translated;
                node._lastTranslatedText = translated;
            } else {
                node._lastTranslatedText = text;
            }
        } 
        else if (node.nodeType === Node.ELEMENT_NODE) {
            // проверка условия
            if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
            
            // проверка условия
            if (node.hasAttribute('title')) {
                const currentTitle = node.getAttribute('title');
                // проверка условия
                if (node.dataset.origTitle === undefined || (node.dataset.lastTranslatedTitle && currentTitle !== node.dataset.lastTranslatedTitle)) {
                    node.dataset.origTitle = currentTitle;
                }
                const origT = node.dataset.origTitle;
                const newT = translateDynamicString(origT, currentLang);
                // проверка условия
                if (currentTitle !== newT) {
                    node.setAttribute('title', newT);
                    node.dataset.lastTranslatedTitle = newT;
                } else {
                    node.dataset.lastTranslatedTitle = currentTitle;
                }
            }
            
            // проверка условия
            if (node.hasAttribute('placeholder')) {
                const currentPlaceholder = node.getAttribute('placeholder');
                // проверка условия
                if (node.dataset.origPlaceholder === undefined || (node.dataset.lastTranslatedPlaceholder && currentPlaceholder !== node.dataset.lastTranslatedPlaceholder)) {
                    node.dataset.origPlaceholder = currentPlaceholder;
                }
                const origP = node.dataset.origPlaceholder;
                const newP = translateDynamicString(origP, currentLang);
                // проверка условия
                if (currentPlaceholder !== newP) {
                    node.setAttribute('placeholder', newP);
                    node.dataset.lastTranslatedPlaceholder = newP;
                } else {
                    node.dataset.lastTranslatedPlaceholder = currentPlaceholder;
                }
            }

            // проверка условия
            if (node.hasAttribute('value') && (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit'))) {
                const currentValue = node.value;
                // проверка условия
                if (node.dataset.origValue === undefined || (node.dataset.lastTranslatedValue && currentValue !== node.dataset.lastTranslatedValue)) {
                    node.dataset.origValue = currentValue;
                }
                const origV = node.dataset.origValue;
                const newV = translateDynamicString(origV, currentLang);
                // проверка условия
                if (currentValue !== newV) {
                    node.value = newV;
                    node.dataset.lastTranslatedValue = newV;
                } else {
                    node.dataset.lastTranslatedValue = currentValue;
                }
            }

            node.childNodes.forEach(translateDOMNodes);
        }
    }

    // объявление функции
    function translateCesiumLabels() {
        // проверка условия
        if (typeof Cesium === 'undefined' || !viewer) return;
        
        // объявление функции
        function processEntity(entity) {
            // 1 обработка labeltext
            if (entity.label && entity.label.text) {
                // если это property (например callbackproperty или constantproperty)
                if (typeof entity.label.text.getValue === 'function') {
                    // проверка условия
                    if (!entity.label.text._isAilurusTranslated) {
                        const origGetValue = entity.label.text.getValue.bind(entity.label.text);
                        entity.label.text.getValue = function(time, result) {
                            const val = origGetValue(time, result);
                            // возврат результата
                            return typeof val === 'string' ? translateDynamicString(val, currentLang) : val;
                        };
                        entity.label.text._isAilurusTranslated = true;
                    }
                } else if (typeof entity.label.text === 'string') {
                    // статическая строка
                    if (!entity.label._origAilurusText || (entity.label._lastTranslatedText && entity.label.text !== entity.label._lastTranslatedText)) {
                        entity.label._origAilurusText = entity.label.text;
                    }
                    // проверка условия
                    if (entity.label._origAilurusText) {
                        const newText = translateDynamicString(entity.label._origAilurusText, currentLang);
                        // проверка условия
                        if (entity.label.text !== newText) {
                            entity.label.text = newText;
                            entity.label._lastTranslatedText = newText;
                        } else {
                            entity.label._lastTranslatedText = entity.label.text;
                        }
                    }
                }
            }

            // 2 обработка description
            if (entity.description) {
                // проверка условия
                if (typeof entity.description.getValue === 'function') {
                    // проверка условия
                    if (!entity.description._isAilurusTranslated) {
                        const origGetValue = entity.description.getValue.bind(entity.description);
                        entity.description.getValue = function(time, result) {
                            const val = origGetValue(time, result);
                            // возврат результата
                            return typeof val === 'string' ? translateDynamicString(val, currentLang) : val;
                        };
                        entity.description._isAilurusTranslated = true;
                    }
                } else if (typeof entity.description === 'string') {
                    // проверка условия
                    if (!entity._origAilurusDesc || (entity._lastTranslatedDesc && entity.description !== entity._lastTranslatedDesc)) {
                        entity._origAilurusDesc = entity.description;
                    }
                    // проверка условия
                    if (entity._origAilurusDesc) {
                        const newDesc = translateDynamicString(entity._origAilurusDesc, currentLang);
                        // проверка условия
                        if (entity.description !== newDesc) {
                            entity.description = newDesc;
                            entity._lastTranslatedDesc = newDesc;
                        } else {
                            entity._lastTranslatedDesc = entity.description;
                        }
                    }
                }
            }
        }

        // проверка условия
        if (viewer.entities) viewer.entities.values.forEach(processEntity);
        // проверка условия
        if (viewer.dataSources) {
            // начало цикла
            for (let i = 0; i < viewer.dataSources.length; i++) {
                viewer.dataSources.get(i).entities.values.forEach(processEntity);
            }
        }
    }

    // объявление функции
    function applyTranslations() {
        updateKnockoutModels();
        translateDOMNodes(document.body);
        translateCesiumLabels();
    }

    const observer = new MutationObserver(() => {
        observer.disconnect(); 
        applyTranslations();
        observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: true,
            attributeFilter: ['title', 'placeholder', 'value'],
            characterData: true
        }); 
    });
    observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['title', 'placeholder', 'value'],
        characterData: true
    });

    applyTranslations();
}