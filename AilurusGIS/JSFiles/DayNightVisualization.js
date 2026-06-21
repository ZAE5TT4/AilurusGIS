(function () {
    // объявление функции
    function initDayNightVisualization(viewer) {
        let container = document.getElementById('dnUiContainer');
        // проверка условия
        if (!container) {
            container = document.createElement('div');
            container.id = 'dnUiContainer';
            container.style.position = 'absolute';
            container.style.top = '255px'; // ПОД КНОПКОЙ СПУТНИКОВ (4-й ряд)
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            viewer.container.appendChild(container);
            
            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `#dnUiContainer { left: var(--panel-offset, 15px) !important; transition: left 0.3s ease-in-out !important; }`;
            document.head.appendChild(syncStyles);
        }

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px'; btn.style.height = '30px'; btn.style.padding = '0';
        btn.style.display = 'flex'; btn.style.justifyContent = 'center'; btn.style.alignItems = 'center';
        btn.title = 'День и ночь';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/DayAndNight.png';
        icon.style.width = '20px'; icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        const timePanel = document.createElement('div');
        timePanel.id = 'dayNightPanel'; // Добавлен ID для стилизации в MobileAdapter
        timePanel.style.position = 'absolute';
        timePanel.style.top = '15px'; 
        timePanel.style.left = 'calc(var(--panel-offset, 15px) + 100px)';
        timePanel.style.backgroundColor = 'rgba(38, 40, 42, 0.95)';
        timePanel.style.color = '#fff';
        timePanel.style.padding = '10px 15px';
        timePanel.style.borderRadius = '6px';
        timePanel.style.fontFamily = 'sans-serif';
        timePanel.style.fontSize = '13px';
        timePanel.style.display = 'none';
        timePanel.style.flexDirection = 'column';
        timePanel.style.gap = '10px';
        timePanel.style.width = '220px';
        timePanel.style.border = '1px solid #444';
        timePanel.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.5)';
        timePanel.style.zIndex = '1000';
        timePanel.style.transition = 'left 0.3s ease-in-out';
        viewer.container.appendChild(timePanel);
        if (window.AilurusPanelManager) window.AilurusPanelManager.register(timePanel, { order: 40 });

        timePanel.innerHTML = `
            <div style="font-weight: bold; text-align: center;">Управление временем</div>
            <input type="range" id="timeSlider" min="-12" max="12" step="0.5" value="0">
            <div style="display:flex; justify-content: space-between; font-size:11px;">
                <span>-12ч</span><span id="timeVal">Сейчас</span><span>+12ч</span>
            </div>
            <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                <input type="checkbox" id="animTimeToggle"> Анимация (1 сек = 1 час)
            </label>
        `;

        let isActive = false;
        let nightLayer = null;
        let originalTime = null;
        let origLighting = null;
        let ownNightLayer = false; // true если мы сами создали слой, false если переиспользовали от спутников

        const timeSlider = document.getElementById('timeSlider');
        const timeVal = document.getElementById('timeVal');
        const animToggle = document.getElementById('animTimeToggle');

        timeSlider.addEventListener('input', (e) => {
            // проверка условия
            if (!originalTime) return;
            const hoursOffset = parseFloat(e.target.value);
            timeVal.textContent = hoursOffset === 0 ? "Сейчас" : (hoursOffset > 0 ? `+${hoursOffset}ч` : `${hoursOffset}ч`);
            const offsetSeconds = hoursOffset * 3600;
            const newTime = Cesium.JulianDate.addSeconds(originalTime, offsetSeconds, new Cesium.JulianDate());
            viewer.clock.currentTime = newTime;
        });

        animToggle.addEventListener('change', (e) => {
            viewer.clock.shouldAnimate = e.target.checked;
            viewer.clock.multiplier = e.target.checked ? 3600 : 1;
        });

        // ищет уже существующий ночной слой (asset 3812) добавленный SatelliteVisualization
        function findExistingNightLayer() {
            for (let i = 0; i < viewer.imageryLayers.length; i++) {
                const layer = viewer.imageryLayers.get(i);
                if (layer && layer.imageryProvider && layer.imageryProvider._assetId === 3812) {
                    return layer;
                }
            }
            return null;
        }

        btn.addEventListener('click', async () => {
            isActive = !isActive;
            
            // проверка условия
            if (isActive) {
                origLighting = viewer.scene.globe.enableLighting;

                viewer.scene.sun.show = true;
                viewer.scene.globe.enableLighting = true;

                originalTime = viewer.clock.currentTime.clone();
                
                // проверяем есть ли уже ночной слой от спутников
                const existing = findExistingNightLayer();
                if (existing) {
                    // переиспользуем слой спутников, настраиваем правильные альфы
                    nightLayer = existing;
                    nightLayer.dayAlpha = 0.0;
                    nightLayer.nightAlpha = 1.0;
                    nightLayer.alpha = 1.0;
                    ownNightLayer = false;
                } else {
                    const provider = await Cesium.IonImageryProvider.fromAssetId(3812);
                    nightLayer = viewer.imageryLayers.addImageryProvider(provider);
                    nightLayer.dayAlpha = 0.0;
                    nightLayer.nightAlpha = 1.0;
                    nightLayer.alpha = 1.0;
                    ownNightLayer = true;
                }

                btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                timePanel.style.display = 'flex';
            } else {
                viewer.scene.globe.enableLighting = origLighting !== null ? origLighting : false;
                viewer.scene.sun.show = false;

                viewer.clock.shouldAnimate = false;
                viewer.clock.multiplier = 1;
                viewer.clock.currentTime = originalTime; 
                
                timeSlider.value = 0;
                timeVal.textContent = "Сейчас";
                animToggle.checked = false;

                // проверка условия
                if (nightLayer) {
                    if (ownNightLayer) {
                        // удаляем слой только если мы его создали
                        viewer.imageryLayers.remove(nightLayer);
                    } else {
                        // возвращаем слой спутников к его исходным настройкам
                        nightLayer.dayAlpha = 0.0;
                        nightLayer.nightAlpha = 0.8;
                        nightLayer.alpha = 1.0;
                    }
                    nightLayer = null;
                    ownNightLayer = false;
                }
                
                btn.style.backgroundColor = '';
                timePanel.style.display = 'none';
            }
        });
    }
    window.initDayNightVisualization = initDayNightVisualization;
})();