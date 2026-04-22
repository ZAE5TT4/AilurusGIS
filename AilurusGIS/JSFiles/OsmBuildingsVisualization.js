(function () {
    /**
     * Интеграция слоя Cesium OSM Buildings с автоматическим рельефом
     */
    function initOsmBuildingsVisualization(viewer) {
        let container = document.getElementById('dnUiContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dnUiContainer';
            container.style.position = 'absolute';
            container.style.top = '255px';
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            viewer.container.appendChild(container);
        }

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px'; 
        btn.style.height = '30px'; 
        btn.style.padding = '0';
        btn.style.display = 'flex'; 
        btn.style.justifyContent = 'center'; 
        btn.style.alignItems = 'center';
        btn.title = '3D Здания (OSM Buildings)';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/OSMBuildings.png';
        icon.style.width = '20px'; 
        icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        let isActive = false;
        let isBusy = false;
        let buildingsTileset = null;

        btn.addEventListener('click', async () => {
            if (isBusy) return;
            isBusy = true;
            btn.style.opacity = '0.5';

            try {
                isActive = !isActive;
                
                if (isActive) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка 3D Зданий...') : null;
                    try {
                        // 1. Сначала включаем рельеф
                        viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
                        
                        // 2. Затем подгружаем здания
                        if (!buildingsTileset) {
                            buildingsTileset = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
                            viewer.scene.primitives.add(buildingsTileset);
                        } else {
                            buildingsTileset.show = true;
                        }
                    } finally {
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                    btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                } else {
                    // Отключаем здания и возвращаем гладкий эллипсоид
                    if (buildingsTileset) {
                        buildingsTileset.show = false;
                    }
                    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                    btn.style.backgroundColor = '';
                }
            } catch (err) {
                console.error("Ошибка загрузки OSM Buildings:", err);
                alert("Не удалось загрузить слой 3D Зданий. Ошибка: " + err.message);
                isActive = false;
                btn.style.backgroundColor = '';
                viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                if (buildingsTileset) buildingsTileset.show = false;
            } finally {
                isBusy = false;
                btn.style.opacity = '1.0';
            }
        });
    }
    
    window.initOsmBuildingsVisualization = initOsmBuildingsVisualization;
})();