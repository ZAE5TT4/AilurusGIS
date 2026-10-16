function initBordersVisualization(viewer) {
    let bordersUiContainer = document.getElementById('bordersUiContainer');
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
        return btn;
    }

    const btnBorders1 = createBorderButton('Sprites/Icons/Borders.png', 'Границы стран (KML)');
    bordersUiContainer.appendChild(btnBorders1);

    const btnBorders2 = createBorderButton('Sprites/Icons/Borders2.png', 'Улучшенные границы стран (SHP)');
    bordersUiContainer.appendChild(btnBorders2);

    let layerVisible1 = false;
    let dataSource1 = null;
    let isBusy1 = false;

    let layerVisible2 = false;
    let dataSource2 = null;
    let isBusy2 = false;


    function styleDataSource(ds) {
        const entities = ds.entities.values;
        const newPolylines = [];

        ds.entities.suspendEvents();

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];

            if (entity.polyline) {
                entity.polyline.material = new Cesium.ColorMaterialProperty(Cesium.Color.WHITE);
                entity.polyline.width = new Cesium.ConstantProperty(1.5);
                entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
                entity.polyline.arcType = new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC);
                entity.polyline.translucencyByDistance = undefined;
                entity.polyline.distanceDisplayCondition = undefined;
            }

            if (entity.polygon) {
                entity.polygon.fill = false;
                entity.polygon.outline = false;

                const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
                if (hierarchy) {
                    const createPolyline = (positions) => {
                        if (!positions || positions.length < 2) return;
                        const linePositions = [...positions, positions[0]];
                        newPolylines.push({
                            polyline: {
                                positions: new Cesium.ConstantProperty(linePositions),
                                material: new Cesium.ColorMaterialProperty(Cesium.Color.WHITE),
                                width: new Cesium.ConstantProperty(1.5),
                                clampToGround: new Cesium.ConstantProperty(true),
                                arcType: new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC),
                                translucencyByDistance: undefined,
                                distanceDisplayCondition: undefined,
                            }
                        });
                    };

                    createPolyline(hierarchy.positions);
                    if (hierarchy.holes) {
                        hierarchy.holes.forEach(hole => createPolyline(hole.positions));
                    }
                }
            }
        }

        newPolylines.forEach(opts => ds.entities.add(opts));
        ds.entities.resumeEvents();
    }

    btnBorders1.addEventListener('click', async function () {
        if (isBusy1) return;
        isBusy1 = true;
        btnBorders1.style.pointerEvents = 'none';
        btnBorders1.style.opacity = '0.5';

        try {
            layerVisible1 = !layerVisible1;
            btnBorders1.style.backgroundColor = layerVisible1 ? 'rgba(38, 84, 121, 1)' : '';

            if (layerVisible1) {
                if (!dataSource1) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка Custom Границ...') : null;
                    btnBorders1.title = 'Загрузка Custom Границ...';
                    try {
                        dataSource1 = await Cesium.GeoJsonDataSource.load('GeoData/Borders/CustomBorders.json');
                        styleDataSource(dataSource1);
                        viewer.dataSources.add(dataSource1);
                    } finally {
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    dataSource1.show = true;
                }
                btnBorders1.title = 'Границы стран KML (Вкл)';
            } else {
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

    btnBorders2.addEventListener('click', async function () {
        if (isBusy2) return;
        isBusy2 = true;
        btnBorders2.style.pointerEvents = 'none';
        btnBorders2.style.opacity = '0.5';

        try {
            layerVisible2 = !layerVisible2;
            btnBorders2.style.backgroundColor = layerVisible2 ? 'rgba(38, 84, 121, 1)' : '';

            if (layerVisible2) {
                if (!dataSource2) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка улучшенных SHP границ стран...') : null;
                    btnBorders2.title = 'Загрузка улучшенных SHP границ стран...';
                    try {
                        dataSource2 = await Cesium.GeoJsonDataSource.load('GeoData/Borders/CustomBorders2.json', {
                            stroke: Cesium.Color.WHITE,
                            fill: Cesium.Color.TRANSPARENT,
                            strokeWidth: 1.5,
                            clampToGround: true
                        });
                        styleDataSource(dataSource2);
                        viewer.dataSources.add(dataSource2);
                    } finally {
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    dataSource2.show = true;
                }
                btnBorders2.title = 'Улучшенные границы стран SHP (Вкл)';
            } else {
                if (dataSource2) {
                    dataSource2.show = false;
                }
                btnBorders2.title = 'Улучшенные границы стран SHP (Выкл)';
            }
        } catch (error) {
            console.error('Ошибка загрузки слоя улучшенных SHP границ стран:', error);
            layerVisible2 = false;
            btnBorders2.style.backgroundColor = '';
            alert('Не удалось загрузить GeoData/Borders/CustomBorders2.json: ' + error.message);
        } finally {
            isBusy2 = false;
            btnBorders2.style.pointerEvents = 'auto';
            btnBorders2.style.opacity = '1.0';
        }
    });
}
