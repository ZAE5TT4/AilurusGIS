(function () {
    function initEarthquakeVisualization(viewer) {
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
            
            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `#eqUiContainer { left: var(--panel-offset, 15px) !important; transition: left 0.3s ease-in-out !important; }`;
            document.head.appendChild(syncStyles);
        }

        const btn = document.createElement('button');
        btn.className = 'cesium-button cesium-toolbar-button';
        btn.style.width = '30px'; btn.style.height = '30px'; btn.style.padding = '0';
        btn.style.display = 'flex'; btn.style.justifyContent = 'center'; btn.style.alignItems = 'center';
        btn.title = 'Землетрясения онлайн (За последние 7 дней)';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/Earthquakes.png';
        icon.style.width = '20px'; icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        let isActive = false;
        let isBusy = false;
        let dataSource = new Cesium.CustomDataSource('Earthquakes');
        viewer.dataSources.add(dataSource);

        // === КЛАСТЕРИЗАЦИЯ ===
        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = 60;
        dataSource.clustering.minimumClusterSize = 3;

        // Кэш иконок для кластеров (по количеству)
        const clusterPinCache = {};
        function getClusterPin(count, colorHex) {
            const key = `${count}_${colorHex}`;
            if (clusterPinCache[key]) return clusterPinCache[key];
            
            const canvas = document.createElement('canvas');
            canvas.width = 56; canvas.height = 56;
            const ctx = canvas.getContext('2d');
            const cx = 28; const cy = 28;

            ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 2 * Math.PI); ctx.fillStyle = colorHex; ctx.fill();
            
            const text = count > 999 ? '999+' : String(count);
            ctx.font = `bold ${count > 99 ? 12 : 15}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(text, cx, cy);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(text, cx, cy);
            
            clusterPinCache[key] = canvas;
            return canvas;
        }

        function getClusterColor(count) {
            if (count >= 50) return '#FF2200';
            if (count >= 20) return '#FF6600';
            if (count >= 10) return '#FFAA00';
            return '#FFEE00';
        }

        const clusterSet = new Set();
        let frameCount = 0; // Для отслеживания момента отсоединения точки от кластера

        dataSource.clustering.clusterEvent.addEventListener(function (clusteredEntities, cluster) {
            cluster.billboard.show = true;
            cluster.label.show = false;
            const count = clusteredEntities.length;
            const colorHex = getClusterColor(count);
            cluster.billboard.image = getClusterPin(count, colorHex);
            cluster.billboard.width = 56;
            cluster.billboard.height = 56;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            cluster.billboard.heightReference = Cesium.HeightReference.NONE; 
            
            // Если кластер появился в новой позиции, запускаем анимацию "вырастания"
            if (!cluster.billboard._lastPos || !Cesium.Cartesian3.equalsEpsilon(cluster.billboard._lastPos, cluster.position, 1.0)) {
                cluster.billboard._currentScale = 0.0;
                cluster.billboard.scale = 0.0;
                cluster.billboard._lastPos = Cesium.Cartesian3.clone(cluster.position);
            }
            
            clusterSet.add(cluster.billboard);

            // Отмечаем точки, которые сейчас внутри этого кластера
            clusteredEntities.forEach(e => {
                e._lastClusteredFrame = frameCount;
            });
        });

        function getColorByMag(mag) {
            if (mag >= 7) return '#FF2200';
            if (mag >= 6) return '#FF6600';
            if (mag >= 5) return '#FFAA00';
            if (mag >= 4) return '#FFEE00';
            return '#AAFFAA';
        }

        const pinCache = {};
        function getOrCreatePin(colorHex) {
            if (pinCache[colorHex]) return pinCache[colorHex];

            const canvas = document.createElement('canvas');
            canvas.width = 40; canvas.height = 40;
            const ctx = canvas.getContext('2d');
            const cx = 20; const cy = 20;

            ctx.beginPath(); ctx.arc(cx, cy, 13.5, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = colorHex; ctx.fill();
            
            pinCache[colorHex] = canvas;
            return canvas;
        }

        // Кэши для полного исключения выделения памяти (GC) при отрисовке прозрачности на горизонте
        const colorCache = {};
        const outlineCache = {};
        
        function getAlphaColor(alpha) {
            const a = Math.round(alpha * 100);
            if (colorCache[a]) return colorCache[a];
            colorCache[a] = new Cesium.Color(1, 1, 1, alpha);
            return colorCache[a];
        }
        
        function getAlphaOutline(alpha) {
            const a = Math.round(alpha * 100);
            if (outlineCache[a]) return outlineCache[a];
            outlineCache[a] = new Cesium.Color(0, 0, 0, alpha);
            return outlineCache[a];
        }

        // === ПЛАВНОЕ ИСЧЕЗНОВЕНИЕ И АНИМАЦИЯ ===
        const entityPositions = []; 
        let edgeFadeHandle = null;

        function setupEdgeFade() {
            if (edgeFadeHandle) return;
            edgeFadeHandle = viewer.scene.preUpdate.addEventListener(function () {
                frameCount++;
                if (!isActive || entityPositions.length === 0) return;

                const cameraPos = viewer.camera.positionWC;
                if (!cameraPos) return;

                const camMag = Cesium.Cartesian3.magnitude(cameraPos);
                if (camMag === 0) return;

                const earthR = 6378137.0;
                const safeCamMag = Math.max(camMag, earthR + 100);
                
                const horizonAngle = Math.acos(earthR / safeCamMag);
                const horizonCos = Math.cos(horizonAngle);
                const fadeStartCos = Math.cos(horizonAngle * 0.70);
                const cosRange = fadeStartCos - horizonCos;

                // 1. Плавное скрытие одиночных точек
                for (let i = 0; i < entityPositions.length; i++) {
                    const item = entityPositions[i];
                    const entity = item.entity;
                    const pPos = item.position;
                    const pMag = item.pMag;

                    const isClustered = entity._lastClusteredFrame >= frameCount - 2;

                    // ТОЧКА ОТСОЕДИНИЛАСЬ: сбрасываем масштаб для анимации появления
                    if (!isClustered && entity._wasClustered) {
                        entity._currentScale = 0.0;
                    }
                    entity._wasClustered = isClustered;

                    // Ускоренная анимация масштабирования (шаг 0.20 вместо 0.08)
                    if (!isClustered && entity._currentScale < 1.0) {
                        entity._currentScale += 0.20; 
                        if (entity._currentScale > 1.0) entity._currentScale = 1.0;
                    }

                    const dot = Cesium.Cartesian3.dot(cameraPos, pPos) / (camMag * pMag);

                    let alpha = 1.0;
                    if (dot < horizonCos) {
                        alpha = 0.0; 
                    } else if (dot < fadeStartCos && cosRange > 0.0001) {
                        alpha = Math.max(0.0, Math.min(1.0, (dot - horizonCos) / cosRange));
                    }
                    if (alpha < 0.02) alpha = 0.0;

                    // Значения применяются автоматически через CallbackProperty
                    entity._currentAlpha = alpha;
                }

                // 2. Плавное скрытие и анимация самих кластеров
                clusterSet.forEach(bb => {
                    if (!bb.show) return; 
                    const pPos = bb.position;
                    if (!pPos) return;

                    const pMag = Cesium.Cartesian3.magnitude(pPos);
                    const dot = Cesium.Cartesian3.dot(cameraPos, pPos) / (camMag * pMag);

                    let alpha = 1.0;
                    if (dot < horizonCos) {
                        alpha = 0.0;
                    } else if (dot < fadeStartCos && cosRange > 0.0001) {
                        alpha = Math.max(0.0, Math.min(1.0, (dot - horizonCos) / cosRange));
                    }
                    if (alpha < 0.02) alpha = 0.0;

                    if (!bb.color || bb.color.alpha !== alpha) {
                        bb.color = new Cesium.Color(1, 1, 1, alpha);
                    }

                    // Ускоренная анимация появления кластера (вырастает из нуля)
                    if (bb._currentScale !== undefined && bb._currentScale < 1.0) {
                        bb._currentScale += 0.20;
                        if (bb._currentScale > 1.0) bb._currentScale = 1.0;
                        bb.scale = bb._currentScale;
                    }
                });
            });
        }

        function teardownEdgeFade() {
            if (edgeFadeHandle) {
                edgeFadeHandle();
                edgeFadeHandle = null;
            }
        }
        // ============================================

        btn.addEventListener('click', async () => {
            if (isBusy) return;
            isBusy = true;
            btn.style.opacity = '0.5';

            try {
                isActive = !isActive;
                
                if (isActive) {
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка данных USGS...') : null;
                    
                    await new Promise(r => setTimeout(r, 50)); 
                    
                    try {
                        dataSource.entities.removeAll();
                        entityPositions.length = 0; 
                        clusterSet.clear(); 

                        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson');
                        const data = await response.json();

                        dataSource.entities.suspendEvents();

                        data.features.forEach(eq => {
                            const coords = eq.geometry.coordinates; 
                            const props = eq.properties;
                            const mag = props.mag || 0;
                            const depth = coords[2] || 0;
                            const colorHex = getColorByMag(mag);
                            const place = props.place || 'Неизвестно';
                            const timeStr = new Date(props.time).toLocaleString('ru-RU');

                            // Вычисляем 3D-позицию заранее
                            const position = Cesium.Cartesian3.fromDegrees(coords[0], coords[1], 0);
                            const pMag = Cesium.Cartesian3.magnitude(position);

                            const entity = dataSource.entities.add({
                                position: position,
                                billboard: {
                                    image: getOrCreatePin(colorHex),
                                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                    // Используем CallbackProperty для анимации без GC
                                    scale: new Cesium.CallbackProperty(function() {
                                        return entity._currentScale !== undefined ? entity._currentScale : 1.0;
                                    }, false),
                                    color: new Cesium.CallbackProperty(function() {
                                        return getAlphaColor(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                                    }, false)
                                },
                                label: {
                                    text: `${place}\nM${mag.toFixed(1)} · Глубина: ${depth} км · ${timeStr}`,
                                    font: 'bold 16px sans-serif',
                                    fillColor: new Cesium.CallbackProperty(function() {
                                        return getAlphaColor(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                                    }, false),
                                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                    outlineColor: new Cesium.CallbackProperty(function() {
                                        return getAlphaOutline(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                                    }, false),
                                    outlineWidth: 5,
                                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                                    horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                                    pixelOffset: new Cesium.Cartesian2(24, 0),
                                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                                    translucencyByDistance: new Cesium.NearFarScalar(1500000, 1.0, 3000000, 0.0),
                                    showBackground: false 
                                },
                                description: `
                                    <div style="font-family:sans-serif;padding:5px;">
                                        <h3 style="margin:0 0 8px;">Магнитуда: ${mag}</h3>
                                        <p style="margin:3px 0;"><b>Место:</b> ${place}</p>
                                        <p style="margin:3px 0;"><b>Глубина:</b> ${depth} км</p>
                                        <p style="margin:3px 0;"><b>Время:</b> ${timeStr}</p>
                                    </div>
                                `
                            });

                            // Инициализация переменных для отслеживания состояния
                            entity._currentScale = 0.0; 
                            entity._currentAlpha = 1.0;
                            entity._wasClustered = false;
                            entity._lastClusteredFrame = -10;

                            entityPositions.push({ entity, position, pMag });
                        });
                        
                        dataSource.entities.resumeEvents();
                    } finally {
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                    dataSource.show = true;
                    setupEdgeFade();
                    btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                } else {
                    dataSource.show = false;
                    teardownEdgeFade();
                    btn.style.backgroundColor = '';
                }
            } catch (err) {
                console.error(err);
                alert("Ошибка загрузки данных о землетрясениях");
                isActive = false;
                btn.style.backgroundColor = '';
                dataSource.show = false;
                teardownEdgeFade();
            } finally {
                isBusy = false;
                btn.style.opacity = '1.0';
            }
        });
    }
    window.initEarthquakeVisualization = initEarthquakeVisualization;
})();