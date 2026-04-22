/**
 * MobileAdapter.js JSFiles/
 * Мобильная адаптация интерфейса AilurusGIS.
 * Перестраивает боковые панели инструментов под сенсорные экраны,
 * добавляет кнопку сворачивания тулбара и защиту от ложных кликов при свайпе.
 * Подключается ПОСЛЕ LoadingIndicator.js и ДО любых визуализаций.
 */
(function () {

    // Определяет мобильное устройство по User-Agent и ширине экрана
    const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;

    // Определяет маленький телефон (< 480px) для дополнительных оптимизаций
    const IS_SMALL  = window.innerWidth <= 480;

    // Проверяет ориентацию экрана в момент вызова
    const IS_LANDSCAPE = () => window.innerWidth > window.innerHeight;

    // Публикует флаг мобильного режима — другие модули читают через window.AilurusIsMobile
    window.AilurusIsMobile = IS_MOBILE;

    // На десктопе завершает работу сразу — никаких изменений не вносит
    if (!IS_MOBILE) return;


    // ── 1. ГЛОБАЛЬНЫЙ CSS ────────────────────────────────────────────────────
    //
    // Создаёт тег <style> и вставляет его в <head>.
    // Применяет мобильные стили ко всем элементам интерфейса сразу.

    const style = document.createElement('style');
    style.id = 'ailurus-mobile-style';
    style.textContent = `

        /* Cesium кнопки — расширяет тач-зону до минимально комфортного размера */
        .cesium-button,
        .cesium-toolbar-button {
            min-width: 38px !important;
            min-height: 38px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        /* Иконки внутри кнопок (кроме фотокарты) — увеличивает для читаемости */
        .cesium-toolbar-button img:not(.cesium-baseLayerPicker-selected) {
            width: 22px !important;
            height: 22px !important;
        }

        /* Исправление для фото карты (BaseLayerPicker) */
        .cesium-button.cesium-baseLayerPicker-button {
            padding: 0 !important;
            display: block !important;
        }
        img.cesium-baseLayerPicker-selected {
            width: 100% !important;
            height: 100% !important;
            min-width: 100% !important;
            min-height: 100% !important;
            border-radius: 4px;
        }

        /* Боковые контейнеры кнопок и панели — плавный переход */
        #environmentUiContainer,
        #bordersUiContainer,
        #bathymetryUiContainer,
        #eqUiContainer,
        #satUiContainer,
        #weatherUiContainer,
        #dnUiContainer,
        #dbUiContainer,
        #dayNightPanel,
        #poiPanel {
            gap: 8px !important;
            transition: opacity 0.25s ease, transform 0.25s ease, left 0.25s ease !important;
        }

        /* Скрытое состояние тулбара — применяется классом toolbar-hidden на body */
        /* Уводит все боковые контейнеры и открытые панели влево и делает невидимыми */
        body.toolbar-hidden #environmentUiContainer,
        body.toolbar-hidden #bordersUiContainer,
        body.toolbar-hidden #bathymetryUiContainer,
        body.toolbar-hidden #eqUiContainer,
        body.toolbar-hidden #satUiContainer,
        body.toolbar-hidden #weatherUiContainer,
        body.toolbar-hidden #dnUiContainer,
        body.toolbar-hidden #dbUiContainer,
        body.toolbar-hidden #dayNightPanel,
        body.toolbar-hidden #poiPanel {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateX(-55px) !important;
        }

        /* Кнопка тоггла — плавный горизонтальный сдвиг при скрытии/показе тулбара */
        #mobileToolbarToggle {
            transition: left 0.25s ease, transform 0.25s ease !important;
            z-index: 3000 !important; /* Гарантированно поверх всех панелей */
        }
        body.toolbar-hidden #mobileToolbarToggle {
            transform: translateX(0) !important;
        }
        body:not(.toolbar-hidden) #mobileToolbarToggle {
            transform: translateX(0) !important;
        }

        /* Плавающие панели с данными (погода, AQI, батиметрия) */
        body > div[style*="position: absolute"][style*="background"]:not(#cityDetailsSidebar):not(#cityDetailsSidebarToggle),
        #cesiumContainer > div[style*="position: absolute"][style*="background"]:not(#cityDetailsSidebar):not(#cityDetailsSidebarToggle) {
            max-width: calc(100vw - 12px) !important;
            max-height: 65vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
        }

        /* Индикатор загрузки — поднимает выше кнопки сворачивания тулбара */
        #global-loading-indicator {
            bottom: 75px !important;
            font-size: 13px !important;
        }

        /* Логотип — уменьшает размер и прозрачность чтобы не мешал управлению */
        #logo {
            width: 110px !important;
            opacity: 0.35 !important;
        }

        /* Кнопка сворачивания тулбара — показывает её (по умолчанию скрыта на десктопе) */
        #mobileToolbarToggle {
            display: flex !important;
        }

        /* Выравнивание панелей Времени и Закладок на мобильных устройствах */
        @media (max-width: 768px) {
            #dayNightPanel, #poiPanel {
                max-width: calc(100vw - 125px) !important; /* Исключаем переполнение экрана, но не ломаем отступ слева */
            }
        }

        /* Ландшафтная ориентация с маленькой высотой — сдвигает ряды кнопок вверх */
        @media (max-height: 500px) {
            #environmentUiContainer { top: 6px !important; }
            #bordersUiContainer     { top: 46px !important; }
            #bathymetryUiContainer  { top: 86px !important; }
            #eqUiContainer          { top: 126px !important; }
            #satUiContainer         { top: 166px !important; }
            #weatherUiContainer     { top: 206px !important; }
            #dnUiContainer          { top: 246px !important; }
            #dbUiContainer          { top: 286px !important; }
            #logo                   { display: none !important; }
            #mobileToolbarToggle    { bottom: 48px !important; }
        }

        /* Маленькие телефоны (< 380px) — уменьшает иконки и скрывает логотип */
        @media (max-width: 380px) {
            .cesium-toolbar-button img:not(.cesium-baseLayerPicker-selected) {
                width: 18px !important;
                height: 18px !important;
            }
            #logo { display: none !important; }
        }
    `;

    // Вставляет стили в документ — с этого момента все правила выше вступают в силу
    document.head.appendChild(style);


    // ── 2. ЗАЩИТА ОТ ЛОЖНЫХ КЛИКОВ ПРИ СВАЙПЕ ───────────────────────────────
    //
    // Вешает слушатели на document глобально, т.к. canvas Cesium ещё не существует.
    // Отслеживает смещение пальца: если > 10px — помечает касание как свайп.
    // Другие модули читают window.ailurusTouchMoved чтобы игнорировать такие касания.

    let _touchMoved = false;
    let _touchStartX = 0, _touchStartY = 0;

    document.addEventListener('touchstart', function(e) {
        _touchMoved = false;
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        const dx = Math.abs(e.touches[0].clientX - _touchStartX);
        const dy = Math.abs(e.touches[0].clientY - _touchStartY);
        if (dx > 10 || dy > 10) _touchMoved = true;
    }, { passive: true });

    Object.defineProperty(window, 'ailurusTouchMoved', {
        get: function() { return _touchMoved; }
    });


    // ── 3. КНОПКА СВОРАЧИВАНИЯ ТУЛБАРА ──────────────────────────────────────

    function ensureMobileToggleButton() {
        if (document.getElementById('mobileToolbarToggle')) return;

        const btn = document.createElement('button');
        btn.id = 'mobileToolbarToggle';
        btn.className = 'cesium-button cesium-toolbar-button'; // Используем классы Cesium для стиля
        btn.title = 'Показать инструменты';
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><path d="M8 5v14l11-7z"/></svg>';
        btn.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 15px;
            z-index: 3000;
            width: 38px;
            height: 38px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 10px rgba(0,0,0,0.4);
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            transition: left 0.25s ease;
        `;
        document.body.appendChild(btn);
    }

    document.addEventListener('DOMContentLoaded', function() {
        ensureMobileToggleButton();
        initToggleBehavior();
        adjustPanelsForMobile();
    });

    if (document.readyState !== 'loading') {
        ensureMobileToggleButton();
        setTimeout(function() {
            initToggleBehavior();
            adjustPanelsForMobile();
        }, 500);
    }


    // ── 4. ЛОГИКА КНОПКИ СВОРАЧИВАНИЯ ───────────────────────────────────────

    function initToggleBehavior() {
        const btn = document.getElementById('mobileToolbarToggle');
        if (!btn || btn._mobileAdapterInited) return;
        btn._mobileAdapterInited = true;

        const iconMenu = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
        const iconPlay = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><path d="M8 5v14l11-7z"/></svg>';

        let toolbarVisible = false;
        document.body.classList.add('toolbar-hidden');
        btn.innerHTML = iconPlay;
        btn.title = 'Показать инструменты';
        btn.style.left = '15px'; // Начальная позиция — у левого края

        btn.addEventListener('click', function() {
            toolbarVisible = !toolbarVisible;

            if (toolbarVisible) {
                document.body.classList.remove('toolbar-hidden');
                btn.innerHTML = iconMenu;
                btn.title = 'Скрыть инструменты';
                // Сдвигаем кнопку вправо — за тулбар (примерно ширина кнопок ~50px)
                btn.style.left = '58px';
            } else {
                document.body.classList.add('toolbar-hidden');
                btn.innerHTML = iconPlay;
                btn.title = 'Показать инструменты';
                // Возвращаем кнопку к левому краю
                btn.style.left = '15px';
            }
        });
    }

    // ── 5. ПОДСТРОЙКА ПЛАВАЮЩИХ ПАНЕЛЕЙ ─────────────────────────────────────

    function adjustPanelsForMobile() {
        const allPanels = document.querySelectorAll(
            '[id$="Panel"]:not(#global-loading-indicator), ' +
            '[id$="Container"]:not([id*="cesium"]):not([id*="Ui"])'
        );

        allPanels.forEach(function(panel) {
            const s = panel.style;
            if (!s.maxWidth || parseInt(s.maxWidth) > window.innerWidth - 20) {
                panel.style.maxWidth = (window.innerWidth - 16) + 'px';
            }
        });
    }

    window.addEventListener('orientationchange', function() {
        setTimeout(adjustPanelsForMobile, 400);
    });

    window.addEventListener('resize', function() {
        adjustPanelsForMobile();
    });

    console.log('[MobileAdapter] Инициализирован. Мобильный режим:', IS_MOBILE, '| Маленький экран:', IS_SMALL);

})();