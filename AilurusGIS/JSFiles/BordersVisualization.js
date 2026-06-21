/* * * скрипт для визуализации границ стран * исправления: * границы больше не пропадают и не становятся прозрачными вдали * устранены разрывы между сегментами * добавлен индикатор загрузки */
// объявление функции
function initBordersVisualization(viewer) {
    let bordersUiContainer = document.getElementById('bordersUiContainer');
    // проверка условия
    if (!bordersUiContainer) {
        bordersUiContainer = document.createElement('div');
        bordersUiContainer.id = 'bordersUiContainer';
        bordersUiContainer.style.position = 'absolute';
        bordersUiContainer.style.top = '95px'; 
        bordersUiContainer.style.left = '15px';
        bordersUiContainer.style.zIndex = '1000';
        bordersUiContainer.style.display = 'flex';
        bordersUiContainer.style.gap = '10px';
        bordersUiContainer.style.alignItems = 'center';
        viewer.container.appendChild(bordersUiContainer);
        
        const syncStyles = document.createElement('style');
        syncStyles.innerHTML = `
            #bordersUiContainer {
                left: var(--panel-offset, 15px) !important;
                transition: left 0.3s ease-in-out !important;
            }
        `;
        document.head.appendChild(syncStyles);
    }

    // объявление функции
    function createBorderButton(iconSrc, defaultTitle) {
        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.padding = '0';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.title = defaultTitle;

        const icon = document.createElement('img');
        icon.src = iconSrc;
        icon.style.width = '20px';
        icon.style.height = '20px';
        btn.appendChild(icon);
        // возврат результата
        return btn;
    }

    const btnBorders1 = createBorderButton('Sprites/Icons/Borders.png', 'Границы стран (KML)');
    bordersUiContainer.appendChild(btnBorders1);

    const btnBorders2 = createBorderButton('Sprites/Icons/Borders2.png', 'Границы Казахстана (GeoJSON)');
    bordersUiContainer.appendChild(btnBorders2);

    let layerVisible1 = false;
    let dataSource1 = null;
    let isBusy1 = false;

    let layerVisible2 = false;
    let dataSource2 = null;
    let isBusy2 = false;

    /* * * стилизация слоя границ * ключевые исправления: * 1 translucencybydistance убран он вызывал прозрачность вдали * 2 distancedisplaycondition убран он скрывал линии на расстоянии * 3 arctype geodesic устраняет разрывы тк линии идут по поверхности сферы * 4 followsurface true линии плотно прижаты к земле * 5 granularity уменьшен больше промежуточных точек нет разрывов */
    // объявление функции
    function styleDataSource(ds) {
        const entities = ds.entities.values;
        const newPolylines = [];

        ds.entities.suspendEvents();

        // начало цикла
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            
            // проверка условия
            if (entity.polyline) {
                // белый цвет без прозрачности по расстоянию
                entity.polyline.material = new Cesium.ColorMaterialProperty(Cesium.Color.WHITE);
                entity.polyline.width = new Cesium.ConstantProperty(1.5);
                entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
                // geodesic даёт непрерывные линии без разрывов на большом расстоянии
                entity.polyline.arcType = new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC);
                // убираем любую зависимость от расстояния
                entity.polyline.translucencyByDistance = undefined;
                entity.polyline.distanceDisplayCondition = undefined;
            }
            
            // проверка условия
            if (entity.polygon) {
                entity.polygon.fill = false;
                entity.polygon.outline = false;
                
                const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
                // проверка условия
                if (hierarchy) {
                    const createPolyline = (positions) => {
                        // проверка условия
                        if (!positions || positions.length < 2) return;
                        // замыкаем контур
                        const linePositions = [...positions, positions[0]];
                        newPolylines.push({
                            polyline: {
                                positions: new Cesium.ConstantProperty(linePositions),
                                material: new Cesium.ColorMaterialProperty(Cesium.Color.WHITE),
                                width: new Cesium.ConstantProperty(1.5),
                                clampToGround: new Cesium.ConstantProperty(true),
                                arcType: new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC),
                                // явно убираем затухание по расстоянию
                                translucencyByDistance: undefined,
                                distanceDisplayCondition: undefined,
                            }
                        });
                    };
                    
                    createPolyline(hierarchy.positions);
                    // проверка условия
                    if (hierarchy.holes) {
                        hierarchy.holes.forEach(hole => createPolyline(hole.positions));
                    }
                }
            }
        }
        
        newPolylines.forEach(opts => ds.entities.add(opts));
        ds.entities.resumeEvents();
    }

    // обработчик кнопки 1 (customborders)
    btnBorders1.addEventListener('click', async function () {
        // проверка условия
        if (isBusy1) return;
        isBusy1 = true;
        btnBorders1.style.pointerEvents = 'none';
        btnBorders1.style.opacity = '0.5';

        // начало блока перехвата ошибок
        try {
            layerVisible1 = !layerVisible1;
            btnBorders1.style.backgroundColor = layerVisible1 ? 'rgba(38, 84, 121, 1)' : '';

            // проверка условия
            if (layerVisible1) {
                // проверка условия
                if (!dataSource1) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка Custom Границ...') : null;
                    btnBorders1.title = 'Загрузка Custom Границ...';
                    // начало блока перехвата ошибок
                    try {
                        dataSource1 = await Cesium.GeoJsonDataSource.load('GeoData/Borders/CustomBorders.json');
                        styleDataSource(dataSource1);
                        viewer.dataSources.add(dataSource1);
                    } finally {
                        // проверка условия
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    dataSource1.show = true;
                }
                btnBorders1.title = 'Границы стран KML (Вкл)';
            } else {
                // проверка условия
                if (dataSource1) {
                    dataSource1.show = false;
                }
                btnBorders1.title = 'Границы стран KML (Выкл)';
            }
        } catch (error) {
            console.error('Ошибка загрузки слоя CustomBorders:', error);
            layerVisible1 = false;
            btnBorders1.style.backgroundColor = '';
            alert('Не удалось загрузить CustomBorders.json: ' + error.message);
        } finally {
            isBusy1 = false;
            btnBorders1.style.pointerEvents = 'auto';
            btnBorders1.style.opacity = '1.0';
        }
    });

    // обработчик кнопки 2 (geojson казахстан)
    btnBorders2.addEventListener('click', async function () {
        // проверка условия
        if (isBusy2) return;
        isBusy2 = true;
        btnBorders2.style.pointerEvents = 'none';
        btnBorders2.style.opacity = '0.5';

        // начало блока перехвата ошибок
        try {
            layerVisible2 = !layerVisible2;
            btnBorders2.style.backgroundColor = layerVisible2 ? 'rgba(38, 84, 121, 1)' : '';

            // проверка условия
            if (layerVisible2) {
                // проверка условия
                if (!dataSource2) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка GeoJSON границ Казахстана...') : null;
                    btnBorders2.title = 'Загрузка GeoJSON границ Казахстана...';
                    // начало блока перехвата ошибок
                    try {
                        dataSource2 = await Cesium.GeoJsonDataSource.load('GeoData/Borders/kazakhstan.geojson', {
                            stroke: Cesium.Color.WHITE,
                            fill: Cesium.Color.TRANSPARENT,
                            strokeWidth: 1.5,
                            clampToGround: true
                        });
                        styleDataSource(dataSource2);
                        viewer.dataSources.add(dataSource2);
                    } finally {
                        // проверка условия
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    dataSource2.show = true;
                }
                btnBorders2.title = 'Границы Казахстана GeoJSON (Вкл)';
            } else {
                // проверка условия
                if (dataSource2) {
                    dataSource2.show = false;
                }
                btnBorders2.title = 'Границы Казахстана GeoJSON (Выкл)';
            }
        } catch (error) {
            console.error('Ошибка загрузки слоя GeoJSON границ Казахстана:', error);
            layerVisible2 = false;
            btnBorders2.style.backgroundColor = '';
            alert('Не удалось загрузить GeoData/Borders/kazakhstan.geojson: ' + error.message);
        } finally {
            isBusy2 = false;
            btnBorders2.style.pointerEvents = 'auto';
            btnBorders2.style.opacity = '1.0';
        }
    });
}
