(function () {
    // объявление функции
    function initTectonicPlatesVisualization(viewer) {
        // прикрепляем к 1му ряду (батиметрия)
        let container = document.getElementById('bathymetryUiContainer');
        // проверка условия
        if (!container) {
            container = document.createElement('div');
            container.id = 'bathymetryUiContainer';
            container.style.position = 'absolute';
            container.style.top = '135px'; 
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            viewer.container.appendChild(container);
        }

        // принудительно задаем gap если контейнер создали не мы
        container.style.display = 'flex';
        container.style.gap = '10px';

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px'; btn.style.height = '30px'; btn.style.padding = '0';
        btn.style.display = 'flex'; btn.style.justifyContent = 'center'; btn.style.alignItems = 'center';
        btn.title = 'Тектонические плиты и разломы';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/TectonicPlates.png';
        icon.style.width = '20px'; icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        let isActive = false;
        let isBusy = false;
        let dataSource = null;

        btn.addEventListener('click', async () => {
            // проверка условия
            if (isBusy) return;
            isBusy = true;
            btn.style.opacity = '0.5';

            // начало блока перехвата ошибок
            try {
                isActive = !isActive;
                
                // проверка условия
                if (isActive) {
                    // проверка условия
                    if (!dataSource) {
                        const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка разломов...') : null;
                        // начало блока перехвата ошибок
                        try {
                            dataSource = await Cesium.GeoJsonDataSource.load('GeoData/TectonicPlates/gem_active_faults.geojson', {
                                clampToGround: true 
                            });
                            
                            const entities = dataSource.entities.values;
                            // начало цикла
                            for (let i = 0; i < entities.length; i++) {
                                const entity = entities[i];
                                // проверка условия
                                if (entity.polyline) {
                                    entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
                                        glowPower: 0.15,
                                        taperPower: 1,
                                        color: Cesium.Color.ORANGERED
                                    });
                                    entity.polyline.width = 3.0;
                                }
                            }
                            viewer.dataSources.add(dataSource);
                        } finally {
                            // проверка условия
                            if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                        }
                    } else {
                        dataSource.show = true;
                    }
                    btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                } else {
                    // проверка условия
                    if (dataSource) dataSource.show = false;
                    btn.style.backgroundColor = '';
                }
            } catch (err) {
                console.error('Ошибка тектоники:', err);
                alert("Не удалось загрузить файл GeoData/TectonicPlates/gem_active_faults.geojson");
                isActive = false;
                btn.style.backgroundColor = '';
            } finally {
                isBusy = false;
                btn.style.opacity = '1.0';
            }
        });
    }
    window.initTectonicPlatesVisualization = initTectonicPlatesVisualization;
})();