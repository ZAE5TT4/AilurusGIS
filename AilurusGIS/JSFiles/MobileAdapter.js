/* * * mobileadapterjs jsfiles/ * мобильная адаптация интерфейса ailurusgis * перестраивает боковые панели инструментов под сенсорные экраны * добавляет кнопку сворачивания тулбара и защиту от ложных кликов при свайпе * подключается после loadingindicatorjs и до любых визуализаций */
(function () {


    // 0 общий менеджер плавающих панелей.
    // Он работает и на десктопе, и на телефонах: панели больше не накладываются друг на друга,
    // а выстраиваются сверху вниз с ограничением по ширине и высоте экрана.
    (function installFloatingPanelManager() {
        if (window.AilurusPanelManager) return;

        const entries = [];
        let scheduled = false;
        let panelIdCounter = 0;
        let offsetProbe = null;

        const baseTop = 15;
        const gap = 10;
        const minPanelHeight = 90;
        const minPanelWidth = 160;

        function ensureProbe() {
            if (offsetProbe || !document.body) return offsetProbe;
            offsetProbe = document.createElement('div');
            offsetProbe.style.position = 'fixed';
            offsetProbe.style.top = '-10000px';
            offsetProbe.style.left = 'var(--panel-offset, 15px)';
            offsetProbe.style.width = '0';
            offsetProbe.style.height = '0';
            offsetProbe.style.pointerEvents = 'none';
            offsetProbe.style.visibility = 'hidden';
            document.body.appendChild(offsetProbe);
            return offsetProbe;
        }

        function getPanelOffsetPx() {
            const probe = ensureProbe();
            if (!probe) return 15;
            const rect = probe.getBoundingClientRect();
            const value = Number(rect.left);
            return Number.isFinite(value) ? Math.max(0, value) : 15;
        }

        function isPanelVisible(panel) {
            if (!panel || !panel.isConnected) return false;
            const style = window.getComputedStyle(panel);
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
        }

        function setStyleIfChanged(panel, property, value) {
            if (panel.style[property] !== value) {
                panel.style[property] = value;
            }
        }

        function getNaturalPanelHeight(panel, viewportHeight) {
            const rectHeight = Math.ceil(panel.getBoundingClientRect().height || 0);
            const scrollHeight = Math.ceil(panel.scrollHeight || 0);
            const height = Math.max(rectHeight, scrollHeight, minPanelHeight);
            return Math.min(height, Math.max(minPanelHeight, viewportHeight - baseTop * 2));
        }

        function scheduleUpdate() {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(updateLayout);
        }

        function updateLayout() {
            scheduled = false;

            const visible = entries
                .filter(entry => isPanelVisible(entry.panel))
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            if (!visible.length) return;

            const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            const offsetPx = getPanelOffsetPx();

            let leftPx = offsetPx + 100;
            let availableWidth = viewportWidth - leftPx - 12;

            // На узких телефонах не даём панели уйти за правый край.
            if (availableWidth < minPanelWidth) {
                leftPx = Math.max(8, Math.min(offsetPx + 55, viewportWidth - minPanelWidth - 8));
                availableWidth = viewportWidth - leftPx - 8;
            }
            if (availableWidth < minPanelWidth) {
                leftPx = 8;
                availableWidth = viewportWidth - 16;
            }

            const maxWidth = Math.max(minPanelWidth, Math.floor(availableWidth));
            const availableHeight = Math.max(140, viewportHeight - baseTop - 12);
            const naturalHeights = visible.map(entry => getNaturalPanelHeight(entry.panel, viewportHeight));
            const totalNaturalHeight = naturalHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, visible.length - 1);
            const compressedMaxHeight = Math.max(
                minPanelHeight,
                Math.floor((availableHeight - gap * Math.max(0, visible.length - 1)) / visible.length)
            );

            let topPx = baseTop;
            visible.forEach((entry, index) => {
                const panel = entry.panel;
                const naturalHeight = naturalHeights[index];
                const maxHeight = totalNaturalHeight <= availableHeight
                    ? Math.max(minPanelHeight, viewportHeight - topPx - 12)
                    : compressedMaxHeight;
                const actualHeight = Math.min(naturalHeight, maxHeight);

                setStyleIfChanged(panel, 'boxSizing', 'border-box');
                setStyleIfChanged(panel, 'left', `${Math.round(leftPx)}px`);
                setStyleIfChanged(panel, 'top', `${Math.round(topPx)}px`);
                setStyleIfChanged(panel, 'maxWidth', `${maxWidth}px`);
                setStyleIfChanged(panel, 'maxHeight', `${Math.max(minPanelHeight, Math.floor(maxHeight))}px`);
                setStyleIfChanged(panel, 'overflowX', 'hidden');
                setStyleIfChanged(panel, 'overflowY', naturalHeight > maxHeight ? 'auto' : 'visible');

                topPx += actualHeight + gap;
            });
        }

        function register(panel, options) {
            if (!panel || entries.some(entry => entry.panel === panel)) return;
            const opts = options || {};
            if (!panel.id) {
                panel.id = `ailurusFloatingPanel${++panelIdCounter}`;
            }
            panel.classList.add('ailurus-floating-panel');
            panel.dataset.ailurusFloatingPanel = 'true';
            if (!panel.style.transition || panel.style.transition.indexOf('top') === -1) {
                panel.style.transition = 'left 0.3s ease-in-out, top 0.2s ease, max-height 0.2s ease';
            }

            const observer = new MutationObserver(scheduleUpdate);
            observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
            entries.push({ panel, order: Number(opts.order || entries.length), observer });
            scheduleUpdate();
        }

        function unregister(panel) {
            const index = entries.findIndex(entry => entry.panel === panel);
            if (index === -1) return;
            entries[index].observer.disconnect();
            entries.splice(index, 1);
            scheduleUpdate();
        }

        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('orientationchange', function () { setTimeout(scheduleUpdate, 300); });
        document.addEventListener('DOMContentLoaded', scheduleUpdate);

        window.AilurusPanelManager = {
            register: register,
            unregister: unregister,
            update: scheduleUpdate
        };
    })();

    // определяет мобильное устройство по useragent и ширине экрана
    const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;

    // определяет маленький телефон (< 480px) для дополнительных оптимизаций
    const IS_SMALL  = window.innerWidth <= 480;

    // проверяет ориентацию экрана в момент вызова
    const IS_LANDSCAPE = () => window.innerWidth > window.innerHeight;

    // публикует флаг мобильного режима другие модули читают через windowailurusismobile
    window.AilurusIsMobile = IS_MOBILE;

    // на десктопе завершает работу сразу никаких изменений не вносит
    if (!IS_MOBILE) return;


    // 1 глобальный css
    //
    // создаёт тег <style> и вставляет его в <head>
    // применяет мобильные стили ко всем элементам интерфейса сразу

    const style = document.createElement('style');
    style.id = 'ailurus-mobile-style';
    style.textContent = `

        /* не даёт боковым панелям создавать скролл страницы на телефонах */
        html {
            overflow: hidden !important;
            overscroll-behavior: none !important;
        }
        body {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            overflow: hidden !important;
            overscroll-behavior: none !important;
        }
        #cesiumContainer {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            overflow: hidden !important;
        }
        #cityDetailsSidebar {
            max-width: calc(100vw - 38px) !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-height: 100vh !important;
            max-height: 100dvh !important;
            box-sizing: border-box !important;
        }

        /* cesium кнопки расширяет тачзону до минимально комфортного размера */
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

        /* иконки внутри кнопок (кроме фотокарты) увеличивает для читаемости */
        .cesium-toolbar-button img:not(.cesium-baseLayerPicker-selected) {
            width: 22px !important;
            height: 22px !important;
        }

        /* исправление для фото карты (baselayerpicker) */
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

        /* боковые контейнеры кнопок и панели плавный переход */
        #environmentUiContainer,
        #bordersUiContainer,
        #bathymetryUiContainer,
        #eqUiContainer,
        #satUiContainer,
        #weatherUiContainer,
        #dnUiContainer,
        #dbUiContainer,
        #dayNightPanel,
        #poiPanel,
        .ailurus-floating-panel {
            gap: 8px !important;
            transition: opacity 0.25s ease, transform 0.25s ease, left 0.25s ease !important;
        }

        /* скрытое состояние тулбара применяется классом toolbarhidden на body */
        /* уводит все боковые контейнеры и открытые панели влево и невидимыми */
        body.toolbar-hidden #environmentUiContainer,
        body.toolbar-hidden #bordersUiContainer,
        body.toolbar-hidden #bathymetryUiContainer,
        body.toolbar-hidden #eqUiContainer,
        body.toolbar-hidden #satUiContainer,
        body.toolbar-hidden #weatherUiContainer,
        body.toolbar-hidden #dnUiContainer,
        body.toolbar-hidden #dbUiContainer,
        body.toolbar-hidden #dayNightPanel,
        body.toolbar-hidden #poiPanel,
        body.toolbar-hidden .ailurus-floating-panel {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateX(-55px) !important;
        }

        /* кнопка тоггла плавный горизонтальный сдвиг при скрытии/показе тулбара */
        #mobileToolbarToggle {
            transition: left 0.25s ease, transform 0.25s ease !important;
            z-index: 3000 !important; /* гарантированно поверх всех панелей */
        }
        body.toolbar-hidden #mobileToolbarToggle {
            transform: translateX(0) !important;
        }
        body:not(.toolbar-hidden) #mobileToolbarToggle {
            transform: translateX(0) !important;
        }

        /* плавающие панели с данными (погода aqi батиметрия) */
        body > div[style*="position: absolute"][style*="background"]:not(#cityDetailsSidebar):not(#cityDetailsSidebarToggle):not(.ailurus-floating-panel),
        #cesiumContainer > div[style*="position: absolute"][style*="background"]:not(#cityDetailsSidebar):not(#cityDetailsSidebarToggle):not(.ailurus-floating-panel) {
            max-width: calc(100vw - 12px) !important;
            max-height: 65vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
        }

        /* индикатор загрузки поднимает выше кнопки сворачивания тулбара */
        #global-loading-indicator {
            bottom: 75px !important;
            font-size: 13px !important;
        }

        /* логотип уменьшает размер и прозрачность чтобы не мешал управлению */
        #logo {
            width: 110px !important;
            opacity: 0.35 !important;
        }

        /* кнопка сворачивания тулбара показывает её (по умолчанию скрыта на десктопе) */
        #mobileToolbarToggle {
            display: flex !important;
        }

        /* выравнивание панелей времени и закладок на мобильных устройствах */
        @media (max-width: 768px) {
            #dayNightPanel, #poiPanel {
                max-width: calc(100vw - 125px) !important; /* исключаем переполнение экрана но не ломаем отступ слева */
            }
        }

        /* ландшафтная ориентация с маленькой высотой сдвигает ряды кнопок вверх */
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

        /* маленькие телефоны (< 380px) уменьшает иконки и скрывает логотип */
        @media (max-width: 380px) {
            .cesium-toolbar-button img:not(.cesium-baseLayerPicker-selected) {
                width: 18px !important;
                height: 18px !important;
            }
            #logo { display: none !important; }
        }
    `;

    // вставляет стили в документ с этого момента все правила выше вступают в силу
    document.head.appendChild(style);


    // 2 защита от ложных кликов при свайпе
    //
    // вешает слушатели на document глобально тк canvas cesium ещё не существует
    // отслеживает смещение пальца: если > 10px помечает касание как свайп
    // другие модули читают windowailurustouchmoved чтобы игнорировать такие касания

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
        // проверка условия
        if (dx > 10 || dy > 10) _touchMoved = true;
    }, { passive: true });

    Object.defineProperty(window, 'ailurusTouchMoved', {
        get: function() { return _touchMoved; }
    });


    // 3 кнопка сворачивания тулбара

    // объявление функции
    function ensureMobileToggleButton() {
        // проверка условия
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

    // проверка условия
    if (document.readyState !== 'loading') {
        ensureMobileToggleButton();
        setTimeout(function() {
            initToggleBehavior();
            adjustPanelsForMobile();
        }, 500);
    }


    // 4 логика кнопки сворачивания

    // объявление функции
    function initToggleBehavior() {
        const btn = document.getElementById('mobileToolbarToggle');
        // проверка условия
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

            // проверка условия
            if (toolbarVisible) {
                document.body.classList.remove('toolbar-hidden');
                btn.innerHTML = iconMenu;
                btn.title = 'Скрыть инструменты';
                // сдвигаем кнопку вправо за тулбар (примерно ширина кнопок ~50px)
                btn.style.left = '58px';
            } else {
                document.body.classList.add('toolbar-hidden');
                btn.innerHTML = iconPlay;
                btn.title = 'Показать инструменты';
                // возвращаем кнопку к левому краю
                btn.style.left = '15px';
            }

            if (window.AilurusPanelManager) {
                window.AilurusPanelManager.update();
                setTimeout(() => window.AilurusPanelManager.update(), 260);
            }
        });
    }

    // 5 подстройка плавающих панелей

    // объявление функции
    function adjustPanelsForMobile() {
        const allPanels = document.querySelectorAll(
            '[id$="Panel"]:not(#global-loading-indicator), ' +
            '[id$="Container"]:not([id*="cesium"]):not([id*="Ui"])'
        );

        allPanels.forEach(function(panel) {
            const s = panel.style;
            // проверка условия
            if (!s.maxWidth || parseInt(s.maxWidth) > window.innerWidth - 20) {
                panel.style.maxWidth = (window.innerWidth - 16) + 'px';
            }
        });
        if (window.AilurusPanelManager) window.AilurusPanelManager.update();
    }

    window.addEventListener('orientationchange', function() {
        setTimeout(adjustPanelsForMobile, 400);
    });

    window.addEventListener('resize', function() {
        adjustPanelsForMobile();
    });

})();