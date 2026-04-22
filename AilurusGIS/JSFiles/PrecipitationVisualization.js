(function () {
    function initPrecipitationVisualization(viewer) {
        // Прикрепляем ко 2-му ряду (Earthquakes)
        let container = document.getElementById('eqUiContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'eqUiContainer';
            container.style.position = 'absolute';
            container.style.top = '175px'; 
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            viewer.container.appendChild(container);
        } else {
            container.style.display = 'flex';
            container.style.gap = '10px';
        }

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px'; btn.style.height = '30px'; btn.style.padding = '0';
        btn.style.display = 'flex'; btn.style.justifyContent = 'center'; btn.style.alignItems = 'center';
        btn.title = 'Радар осадков онлайн';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/Precipitation.png';
        icon.style.width = '20px'; icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        // Панель - Легенда Осадков (Сдвинута на +100px правее)
        const legendPanel = document.createElement('div');
        legendPanel.style.position = 'absolute';
        legendPanel.style.top = '15px';
        legendPanel.style.left = 'calc(var(--panel-offset, 15px) + 100px)';
        legendPanel.style.backgroundColor = 'rgba(20, 25, 30, 0.95)';
        legendPanel.style.color = '#fff';
        legendPanel.style.padding = '12px 20px';
        legendPanel.style.borderRadius = '6px';
        legendPanel.style.fontFamily = 'sans-serif';
        legendPanel.style.fontSize = '13px';
        legendPanel.style.display = 'none';
        legendPanel.style.zIndex = '1000';
        legendPanel.style.border = '1px solid #555';
        legendPanel.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.5)';
        legendPanel.style.pointerEvents = 'none';
        legendPanel.style.transition = 'left 0.3s ease-in-out';
        
        legendPanel.innerHTML = `
            <div style="font-weight:bold; margin-bottom: 10px; text-align:center; font-size:14px;">Уровень осадков (мм/ч)</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:14px; height:14px; background:#4deeea; border-radius:50%;"></span> Слабый дождь</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:14px; height:14px; background:#295ddb; border-radius:50%;"></span> Умеренный дождь</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:14px; height:14px; background:#ffeb3b; border-radius:50%;"></span> Сильный дождь</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:14px; height:14px; background:#ff2a2a; border-radius:50%;"></span> Экстремальный ливень</div>
                <div style="display:flex; align-items:center; gap:8px;"><span style="display:inline-block; width:14px; height:14px; background:#e400ff; border-radius:50%;"></span> Град или Снег</div>
            </div>
            <div style="font-size:11px; color:#aaa; margin-top:12px; text-align:center; border-top: 1px solid #444; padding-top: 6px;">
                <b>Внимание:</b> Наземные доплеровские радары<br>
                недоступны в некоторых странах (напр. РФ)<br>
                из-за ограничений метеослужб.
            </div>
        `;
        viewer.container.appendChild(legendPanel);

        let isActive = false;
        let isBusy = false;
        let rainLayer = null;

        btn.addEventListener('click', async () => {
            if (isBusy) return;
            isBusy = true;
            btn.style.opacity = '0.5';

            try {
                isActive = !isActive;
                
                if (isActive) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка радара осадков...') : null;
                    try {
                        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                        if (!response.ok) throw new Error("Сбой RainViewer API");
                        const data = await response.json();
                        
                        const host = data.host;
                        const pastData = data.radar.past;
                        // Берём самый последний кадр для максимальной актуальности
                        const targetFrame = pastData[pastData.length - 1];
                        
                        const provider = new Cesium.UrlTemplateImageryProvider({
                            url: `${host}${targetFrame.path}/512/{z}/{x}/{y}/4/1_1.png`,
                            credit: 'RainViewer',
                            minimumLevel: 1,
                            maximumLevel: 8 // Повысили максимальную детализацию (зум) радаров
                        });

                        rainLayer = viewer.imageryLayers.addImageryProvider(provider);
                        rainLayer.alpha = 0.7; 
                        
                        legendPanel.style.display = 'block';
                    } finally {
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                    btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                } else {
                    if (rainLayer) {
                        viewer.imageryLayers.remove(rainLayer);
                        rainLayer = null;
                    }
                    legendPanel.style.display = 'none';
                    btn.style.backgroundColor = '';
                }
            } catch (err) {
                console.error(err);
                alert("Ошибка загрузки данных радара осадков.");
                isActive = false;
                btn.style.backgroundColor = '';
                legendPanel.style.display = 'none';
                if (rainLayer) {
                    viewer.imageryLayers.remove(rainLayer);
                    rainLayer = null;
                }
            } finally {
                isBusy = false;
                btn.style.opacity = '1.0';
            }
        });
    }
    window.initPrecipitationVisualization = initPrecipitationVisualization;
})();