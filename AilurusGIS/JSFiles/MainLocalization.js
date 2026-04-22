/**
 * Скрипт локализации для главной страницы (index_main.html).
 * Синхронизируется с картой через localStorage ('ailurus_lang').
 */

const mainDictionary = {
    "title": {
        ru: "AilurusGIS - Платформа для 3D геоданных",
        en: "AilurusGIS - 3D Geospatial Platform",
        kz: "AilurusGIS - 3D геодеректерге арналған платформа"
    },
    "nav_about": {
        ru: "О платформе",
        en: "About",
        kz: "Платформа туралы"
    },
    "nav_features": {
        ru: "Возможности",
        en: "Features",
        kz: "Мүмкіндіктер"
    },
    "nav_community": {
        ru: "Сообщество",
        en: "Community",
        kz: "Қауымдастық"
    },
    "btn_open_map": {
        ru: "Открыть Карту",
        en: "Open Map",
        kz: "Картаны ашу"
    },
    "hero_title": {
        ru: "Платформа для 3D Геопространства",
        en: "The Platform for 3D Geospatial",
        kz: "3D Геокеңістік платформасы"
    },
    "hero_subtitle": {
        ru: "AilurusGIS — это передовая платформа для визуализации, анализа и управления 3D-данными о Земле. Раскройте потенциал ваших геоданных прямо в браузере.",
        en: "AilurusGIS is the open platform for software applications designed to unleash the power of 3D data right in your browser.",
        kz: "AilurusGIS — Жер туралы 3D деректерді визуалдау, талдау және басқаруға арналған озық платформа. Браузерде геодеректердің әлеуетін ашыңыз."
    },
    "btn_get_started": {
        ru: "Начать работу",
        en: "Get Started",
        kz: "Бастау"
    },
    "features_title": {
        ru: "Создавайте инновационные ГИС-приложения",
        en: "Build Innovative 3D Geospatial Applications",
        kz: "Инновациялық ГАЖ қосымшаларын жасаңыз"
    },
    "card1_title": {
        ru: "Оптимизация данных",
        en: "Data Optimization",
        kz: "Деректерді оңтайландыру"
    },
    "card1_desc": {
        ru: "Продвинутая архитектура позволяет обрабатывать и отображать огромные массивы геоданных с максимальной плавностью.",
        en: "Advanced architecture allows processing and displaying massive arrays of geodata with maximum smoothness.",
        kz: "Озық архитектура үлкен геодеректер массивтерін барынша тегіс өңдеуге және көрсетуге мүмкіндік береді."
    },
    "card2_title": {
        ru: "Точность",
        en: "Precise",
        kz: "Дәлдік"
    },
    "card2_desc": {
        ru: "Визуализируйте и анализируйте ваши данные на самом точном в мире движке рендеринга виртуального глобуса.",
        en: "Visualize and analyze your data on the world's most precise virtual globe rendering engine.",
        kz: "Деректеріңізді әлемдегі ең дәл виртуалды глобусты көрсету қозғалтқышында визуалдаңыз және талдаңыз."
    },
    "card3_title": {
        ru: "Интеграция",
        en: "Integration",
        kz: "Интеграция"
    },
    "card3_desc": {
        ru: "Поддержка погодных радаров, индексов качества воздуха (AQI), спутников в реальном времени и многого другого.",
        en: "Support for weather radars, air quality indices (AQI), real-time satellites, and much more.",
        kz: "Ауа райы радарларын, ауа сапасының индекстерін (AQI), нақты уақыттағы жерсеріктерді және т.б. қолдау."
    },
    "cta_title": {
        ru: "Начните визуализировать данные с AilurusGIS",
        en: "Start visualizing data with AilurusGIS",
        kz: "AilurusGIS көмегімен деректерді визуалдауды бастаңыз"
    },
    "learn_more": {
        ru: "Узнать больше",
        en: "Learn More",
        kz: "Көбірек білу"
    },
    "footer_text": {
        ru: "Данные предоставляются из открытых и бесплатных источников в ознакомительных целях и не нарушают авторские права.",
        en: "Data is provided from open and free sources for informational purposes and does not violate copyright.",
        kz: "Деректер ашық және тегін көздерден таныстыру мақсатында ұсынылады және авторлық құқықты бұзбайды."
    },
    "footer_socials_text": {
        ru: "Социальные сети автора:",
        en: "Author's social networks:",
        kz: "Автордың әлеуметтік желілері:"
    },
    // --- НОВЫЕ ТЕКСТЫ ДЛЯ СКРИНШОТОВ ---
    "showcase1_title": {
        ru: "Динамическая погода и ветра",
        en: "Dynamic Weather & Winds",
        kz: "Динамикалық ауа райы және жел"
    },
    "showcase1_desc": {
        ru: "Наблюдайте за глобальной циркуляцией атмосферы. Тепловая карта и потоки ветра в реальном времени позволяют анализировать погодные условия на всей планеты.",
        en: "Observe global atmospheric circulation. The heatmap and real-time wind flows allow you to analyze weather conditions across the entire planet.",
        kz: "Атмосфераның ғаламдық айналымын бақылаңыз. Жылу картасы және нақты уақыттағы жел ағындары бүкіл ғаламшардағы ауа райы жағдайларын талдауға мүмкіндік береді."
    },
    "showcase2_title": {
        ru: "Сейсмическая активность",
        en: "Seismic Activity",
        kz: "Сейсмикалық белсенділік"
    },
    "showcase2_desc": {
        ru: "Интеграция данных Геологической службы США (USGS) и базы тектонических разломов. Изучайте эпицентры землетрясений с привязкой к границам литосферных плит.",
        en: "Integration of USGS data and tectonic fault databases. Study earthquake epicenters in relation to lithospheric plate boundaries.",
        kz: "АҚШ Геологиялық қызметінің (USGS) деректерін және тектоникалық жарықтар базасын біріктіру. Жер сілкінісі ошақтарын литосфералық плиталар шекараларына байланысты зерттеңіз."
    },
    "showcase3_title": {
        ru: "Экологический мониторинг",
        en: "Environmental Monitoring",
        kz: "Экологиялық мониторинг"
    },
    "showcase3_desc": {
        ru: "Детальная визуализация Индекса качества воздуха (AQI). Тысячи наземных станций и глобальная интерполяция данных помогают оценивать экологическую обстановку.",
        en: "Detailed visualization of the Air Quality Index (AQI). Thousands of ground stations and global data interpolation help assess the environmental situation.",
        kz: "Ауа сапасы индексінің (AQI) егжей-тегжейлі визуализациясы. Мыңдаған жерүсті станциялары және ғаламдық деректер интерполяциясы экологиялық жағдайды бағалауға көмектеседі."
    },
    "showcase4_title": {
        ru: "Детальная аналитика локаций",
        en: "Detailed Location Analytics",
        kz: "Локациялардың толық аналитикасы"
    },
    "showcase4_desc": {
        ru: "Интерактивная панель с прогнозом погоды на 5 дней, почасовым графиком качества воздуха и подробными показателями загрязнения для любого выбранного города.",
        en: "An interactive panel featuring a 5-day weather forecast, an hourly air quality chart, and detailed pollution metrics for any selected city.",
        kz: "Кез келген таңдалған қала үшін 5 күндік ауа райы болжамы, ауа сапасының сағаттық кестесі және ластанудың егжей-тегжейлі көрсеткіштері бар интерактивті панель."
    }
};

// Функция переключения языка
function changeLanguage(lang) {
    // Сохраняем выбор, чтобы на карте (index_cesium.html) открылся тот же язык
    localStorage.setItem('ailurus_lang', lang);
    
    // Переводим все элементы с атрибутом data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (mainDictionary[key] && mainDictionary[key][lang]) {
            el.textContent = mainDictionary[key][lang];
        }
    });

    // Устанавливаем язык документа
    document.documentElement.lang = lang;
}

// При загрузке страницы проверяем сохраненный язык
document.addEventListener("DOMContentLoaded", () => {
    let currentLang = localStorage.getItem('ailurus_lang') || 'ru';
    
    // Устанавливаем select в правильное положение
    const langSelect = document.getElementById('langSwitcher');
    if (langSelect) {
        langSelect.value = currentLang;
    }

    // Применяем перевод
    changeLanguage(currentLang);
});