/* * * кнопка управления fps * цикл: 60 fps → 30 fps → без ограничений → 60 fps → * размещается в leftbottomcontrols правее кнопки отключения шейдеров * @param {cesiumviewer} viewer */
(function () {
    // объявление функции
    function initFpsToggle(viewer) {
        // ищем или создаём контейнер рядом с кнопкой шейдеров
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

            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `#leftBottomControls { left: var(--panel-offset, 15px) !important; transition: left 0.3s ease-in-out !important; }`;
            document.head.appendChild(syncStyles);
        }

        // состояния: 0 60fps 1 30fps 2 unlimited
        const FPS_STATES = [
            { label: '60 FPS',       fps: 60,       icon: 'Sprites/Icons/60FPS.png',        title: 'Режим 60 FPS (нажмите для смены)' },
            { label: '30 FPS',       fps: 30,       icon: 'Sprites/Icons/30FPS.png',        title: 'Режим 30 FPS (нажмите для смены)' },
            { label: 'Без лимита',   fps: Infinity, icon: 'Sprites/Icons/UnlimitedFPS.png', title: 'Без ограничения FPS (нажмите для смены)' }
        ];

        let currentState = 0;

        // применяем начальный режим 60 fps
        applyFpsState(viewer, FPS_STATES[0]);

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.padding = '0';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.title = FPS_STATES[0].title;

        const icon = document.createElement('img');
        icon.src = FPS_STATES[0].icon;
        icon.style.width = '20px';
        icon.style.height = '20px';
        btn.appendChild(icon);

        // добавляем после уже существующих кнопок в контейнере
        container.appendChild(btn);

        btn.addEventListener('click', () => {
            currentState = (currentState + 1) % FPS_STATES.length;
            const state = FPS_STATES[currentState];
            icon.src = state.icon;
            btn.title = state.title;
            applyFpsState(viewer, state);
        });
    }

    // объявление функции
    function applyFpsState(viewer, state) {
        // проверка условия
        if (state.fps === Infinity) {
            // убираем все ограничения
            viewer.targetFrameRate = undefined;
            viewer.useDefaultRenderLoop = true;
            viewer.scene.requestRenderMode = false;
        } else {
            viewer.targetFrameRate = state.fps;
            viewer.useDefaultRenderLoop = true;
            viewer.scene.requestRenderMode = false;
        }
    }

    window.initFpsToggle = initFpsToggle;
})();