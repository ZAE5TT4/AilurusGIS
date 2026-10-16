(function () {
    function initFpsToggle(viewer) {
        let container = document.getElementById('leftBottomControls');
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

        const FPS_STATES = [
            { label: '60 FPS',       fps: 60,       icon: 'Sprites/Icons/60FPS.png',        title: 'Режим 60 FPS (нажмите для смены)' },
            { label: '30 FPS',       fps: 30,       icon: 'Sprites/Icons/30FPS.png',        title: 'Режим 30 FPS (нажмите для смены)' },
            { label: 'Без лимита',   fps: Infinity, icon: 'Sprites/Icons/UnlimitedFPS.png', title: 'Без ограничения FPS (нажмите для смены)' }
        ];

        let currentState = 0;

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

        container.appendChild(btn);

        btn.addEventListener('click', () => {
            currentState = (currentState + 1) % FPS_STATES.length;
            const state = FPS_STATES[currentState];
            icon.src = state.icon;
            btn.title = state.title;
            applyFpsState(viewer, state);
        });
    }

    function applyFpsState(viewer, state) {
        if (state.fps === Infinity) {
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
