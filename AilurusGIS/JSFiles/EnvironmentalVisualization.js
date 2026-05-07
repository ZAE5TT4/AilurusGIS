(function () {
    /* * * aqi станции глобальное покрытие * текст появляется плавно при приближении иконки стиля "прогноз погоды" * экстремальная оптимизация: кэширование иконок и асинхронный рендеринг для устранения фризов * исправления v5: * ускорена анимация масштаба (bloomэффект) при соединении/отсоединении кластеров */
    // объявление функции
    function initEnvironmentalVisualization(viewer, options) {
        // проверка условия
        if (!viewer || typeof Cesium === 'undefined') return null;

        const config = Object.assign({
            bounds: { latMin: -85.0, lonMin: -180.0, latMax: 85.0, lonMax: 180.0 },
            maxStations: 10000,
            cacheKey: 'cesium_aqi_bounds_cache_global_v2',
            cacheMs: 1000 * 60 * 15 
        }, options || {});

        const dataSource = new Cesium.CustomDataSource('AqicnStations');
        viewer.dataSources.add(dataSource);
        dataSource.show = false;

        // кластеризация aqi станций
        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = 60; 
        dataSource.clustering.minimumClusterSize = 4;

        const _aqiClusterPinCache = {};
        // объявление функции
        function _getAqiClusterPin(count) {
            // проверка условия
            if (_aqiClusterPinCache[count]) return _aqiClusterPinCache[count];
            
            let color = '#009966';
            // проверка условия
            if (count >= 100) color = '#cc0033';
            else if (count >= 50) color = '#ff9933';
            else if (count >= 20) color = '#ffde33';
            
            const canvas = document.createElement('canvas');
            canvas.width = 56; canvas.height = 56;
            const ctx = canvas.getContext('2d');
            const cx = 28; const cy = 28;

            ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
            
            const text = count > 999 ? '999+' : String(count);
            ctx.font = `bold ${count > 99 ? 12 : 15}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000'; 
            ctx.strokeText(text, cx, cy);
            
            ctx.fillStyle = '#FFFFFF'; 
            ctx.fillText(text, cx, cy);

            _aqiClusterPinCache[count] = canvas;
            // возврат результата
            return canvas;
        }

        const clusterSet = new Set();
        let frameCount = 0; 

        dataSource.clustering.clusterEvent.addEventListener(function (clusteredEntities, cluster) {
            cluster.billboard.show = true;
            cluster.label.show = false;
            const count = clusteredEntities.length;
            cluster.billboard.image = _getAqiClusterPin(count);
            cluster.billboard.width = 56;
            cluster.billboard.height = 56;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            cluster.billboard.heightReference = Cesium.HeightReference.NONE;
            
            // проверка условия
            if (!cluster.billboard._lastPos || !Cesium.Cartesian3.equalsEpsilon(cluster.billboard._lastPos, cluster.position, 1.0)) {
                cluster.billboard._currentScale = 0.0;
                cluster.billboard.scale = 0.0;
                cluster.billboard._lastPos = Cesium.Cartesian3.clone(cluster.position);
            }
            
            clusterSet.add(cluster.billboard);

            clusteredEntities.forEach(e => {
                e._lastClusteredFrame = frameCount;
            });
        });

        let busy = false;
        let loadedOnce = false;
        let layerVisible = false;

        const colorCache = {};
        const outlineCache = {};
        
        // объявление функции
        function getAlphaColor(alpha) {
            const a = Math.round(alpha * 100);
            // проверка условия
            if (colorCache[a]) return colorCache[a];
            colorCache[a] = new Cesium.Color(1, 1, 1, alpha);
            // возврат результата
            return colorCache[a];
        }
        
        // объявление функции
        function getAlphaOutline(alpha) {
            const a = Math.round(alpha * 100);
            // проверка условия
            if (outlineCache[a]) return outlineCache[a];
            outlineCache[a] = new Cesium.Color(0, 0, 0, alpha);
            // возврат результата
            return outlineCache[a];
        }

        // плавное исчезновение и анимация
        const entityPositions = []; 
        let edgeFadeHandle = null;

        // объявление функции
        function setupEdgeFade() {
            // проверка условия
            if (edgeFadeHandle) return; 
            edgeFadeHandle = viewer.scene.preUpdate.addEventListener(function () {
                frameCount++;
                // проверка условия
                if (!layerVisible || entityPositions.length === 0) return;

                const cameraPos = viewer.camera.positionWC;
                // проверка условия
                if (!cameraPos) return;

                const camMag = Cesium.Cartesian3.magnitude(cameraPos);
                // проверка условия
                if (camMag === 0) return;

                const earthR = 6378137.0;
                const safeCamMag = Math.max(camMag, earthR + 100);
                
                const horizonAngle = Math.acos(earthR / safeCamMag);
                const horizonCos = Math.cos(horizonAngle);
                const fadeStartCos = Math.cos(horizonAngle * 0.70);
                const cosRange = fadeStartCos - horizonCos;

                // 1 точки станций
                for (let i = 0; i < entityPositions.length; i++) {
                    const item = entityPositions[i];
                    const entity = item.entity;
                    const pPos = item.position;
                    const pMag = item.pMag;

                    const isClustered = entity._lastClusteredFrame >= frameCount - 2;

                    // проверка условия
                    if (!isClustered && entity._wasClustered) {
                        entity._currentScale = 0.0;
                    }
                    entity._wasClustered = isClustered;

                    // ускоренная анимация масштабирования (шаг 020 вместо 008)
                    if (!isClustered && entity._currentScale < 1.0) {
                        entity._currentScale += 0.20; 
                        // проверка условия
                        if (entity._currentScale > 1.0) entity._currentScale = 1.0;
                    }

                    const dot = Cesium.Cartesian3.dot(cameraPos, pPos) / (camMag * pMag);

                    let alpha = 1.0;
                    // проверка условия
                    if (dot < horizonCos) {
                        alpha = 0.0;
                    } else if (dot < fadeStartCos && cosRange > 0.0001) {
                        alpha = Math.max(0.0, Math.min(1.0, (dot - horizonCos) / cosRange));
                    }
                    // проверка условия
                    if (alpha < 0.02) alpha = 0.0;

                    entity._currentAlpha = alpha;
                }

                // 2 кластеры станций
                clusterSet.forEach(bb => {
                    // проверка условия
                    if (!bb.show) return;
                    const pPos = bb.position;
                    // проверка условия
                    if (!pPos) return;

                    const pMag = Cesium.Cartesian3.magnitude(pPos);
                    const dot = Cesium.Cartesian3.dot(cameraPos, pPos) / (camMag * pMag);

                    let alpha = 1.0;
                    // проверка условия
                    if (dot < horizonCos) {
                        alpha = 0.0;
                    } else if (dot < fadeStartCos && cosRange > 0.0001) {
                        alpha = Math.max(0.0, Math.min(1.0, (dot - horizonCos) / cosRange));
                    }
                    // проверка условия
                    if (alpha < 0.02) alpha = 0.0;

                    // проверка условия
                    if (!bb.color || bb.color.alpha !== alpha) {
                        bb.color = new Cesium.Color(1, 1, 1, alpha);
                    }

                    // ускоренная анимация появления кластера
                    if (bb._currentScale !== undefined && bb._currentScale < 1.0) {
                        bb._currentScale += 0.20;
                        // проверка условия
                        if (bb._currentScale > 1.0) bb._currentScale = 1.0;
                        bb.scale = bb._currentScale;
                    }
                });
            });
        }

        // объявление функции
        function teardownEdgeFade() {
            // проверка условия
            if (edgeFadeHandle) {
                edgeFadeHandle();
                edgeFadeHandle = null;
            }
        }
        //

        let uiContainer = document.getElementById('environmentUiContainer');
        // проверка условия
        if (!uiContainer) {
            uiContainer = document.createElement('div');
            uiContainer.id = 'environmentUiContainer';
            uiContainer.style.position = 'absolute';
            uiContainer.style.top = '55px';
            uiContainer.style.left = '15px';
            uiContainer.style.zIndex = '1000';
            uiContainer.style.display = 'flex';
            uiContainer.style.gap = '10px';
            uiContainer.style.alignItems = 'center';
            viewer.container.appendChild(uiContainer);
        }

        const btnAqi = document.createElement('button');
        btnAqi.className = 'cesium-button cesium-toolbar-button';
        btnAqi.style.width = '30px'; btnAqi.style.height = '30px';
        btnAqi.style.padding = '0'; btnAqi.style.display = 'flex';
        btnAqi.style.justifyContent = 'center'; btnAqi.style.alignItems = 'center';
        btnAqi.title = 'Станции AQI — весь мир (Вкл/Выкл)';

        const iconAqi = document.createElement('img');
        iconAqi.src = 'Sprites/Icons/AirQuality.png';
        iconAqi.style.width = '20px'; iconAqi.style.height = '20px';
        btnAqi.appendChild(iconAqi);
        uiContainer.appendChild(btnAqi);

        btnAqi.addEventListener('click', async function () {
            // проверка условия
            if (busy) return;
            // проверка условия
            if (!loadedOnce) {
                const ok = await loadStations(false);
                // возврат результата
                return;
            }
            layerVisible = !layerVisible;
            applyVisibility();
        });

        // объявление функции
        function applyVisibility() {
            dataSource.show = layerVisible;
            btnAqi.style.backgroundColor = layerVisible ? 'rgba(38, 84, 121, 1)' : '';
            // проверка условия
            if (layerVisible) {
                setupEdgeFade();
            } else {
                teardownEdgeFade();
            }
        }

        // объявление функции
        function setBusyState(isBusy) {
            busy = isBusy;
            btnAqi.style.pointerEvents = isBusy ? 'none' : 'auto';
            btnAqi.style.opacity = isBusy ? '0.5' : '1.0';
        }

        // объявление функции
        function readCache(key) {
            // начало блока перехвата ошибок
            try {
                const raw = localStorage.getItem(key);
                // проверка условия
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                // проверка условия
                if (!parsed || !Array.isArray(parsed.data)) return null;
                // проверка условия
                if (Date.now() - parsed.timestamp > config.cacheMs) return null;
                // возврат результата
                return parsed.data;
            } catch (_e) { return null; }
        }

        // объявление функции
        function writeCache(key, data) {
            // начало блока перехвата ошибок
            try {
                localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
            } catch (_e) {}
        }

        // объявление функции
        async function fetchJson(url) {
            const response = await fetch(url);
            const text = await response.text();
            let payload = null;
            // начало блока перехвата ошибок
            try { payload = JSON.parse(text); } catch (_e) {
                // проверка условия
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                throw new Error('Invalid JSON');
            }
            // проверка условия
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            // возврат результата
            return payload;
        }

        // объявление функции
        async function requestBounds(bounds) {
            const token = window.AQICN_API_TOKEN || '68f7e90d5c4016cf4a7e1ebc8b685acf315a246d';
            const params = new URLSearchParams({
                latMin: String(bounds.latMin), lonMin: String(bounds.lonMin),
                latMax: String(bounds.latMax), lonMax: String(bounds.lonMax),
                token
            });
            // начало блока перехвата ошибок
            try {
                const data = await fetchJson(`/api/aqi/bounds?${params}`);
                // проверка условия
                if (data.status !== 'ok') throw new Error('AQICN error');
                // возврат результата
                return data.data || [];
            } catch (e) {
                const latlng = `${bounds.latMin},${bounds.lonMin},${bounds.latMax},${bounds.lonMax}`;
                const direct = await fetchJson(`https://api.waqi.info/map/bounds/?latlng=${encodeURIComponent(latlng)}&token=${encodeURIComponent(token)}`);
                // проверка условия
                if (direct.status !== 'ok') throw new Error('AQICN direct error');
                // возврат результата
                return direct.data || [];
            }
        }

        // объявление функции
        function splitGlobal() {
            const tiles = [];
            const latSteps = 6, lonSteps = 8;
            const latSize = 170 / latSteps; 
            const lonSize = 360 / lonSteps;
            // начало цикла
            for (let i = 0; i < latSteps; i++) {
                // начало цикла
                for (let j = 0; j < lonSteps; j++) {
                    tiles.push({
                        latMin: -85 + i * latSize,
                        latMax: -85 + (i + 1) * latSize,
                        lonMin: -180 + j * lonSize,
                        lonMax: -180 + (j + 1) * lonSize
                    });
                }
            }
            // возврат результата
            return tiles;
        }

        // объявление функции
        async function requestAllTiles() {
            const tiles = splitGlobal();
            const all = [];
            const batchSize = 4;
            // начало цикла
            for (let i = 0; i < tiles.length; i += batchSize) {
                const batch = tiles.slice(i, i + batchSize);
                const results = await Promise.all(
                    batch.map(tile => requestBounds(tile).catch(() => []))
                );
                results.forEach(r => { if (Array.isArray(r)) all.push(...r); });
                // проверка условия
                if (i + batchSize < tiles.length) {
                    await new Promise(r => setTimeout(r, 250));
                }
            }
            // возврат результата
            return all;
        }

        // объявление функции
        function parseAqi(raw) {
            // проверка условия
            if (raw === null || raw === undefined || raw === '-') return null;
            const n = Number(raw);
            // возврат результата
            return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
        }

        // объявление функции
        function getAqiCategory(aqi) {
            // проверка условия
            if (aqi === null) return 'Нет данных';
            // проверка условия
            if (aqi <= 50) return 'Хорошо';
            // проверка условия
            if (aqi <= 100) return 'Умеренно';
            // проверка условия
            if (aqi <= 150) return 'Вредно чувствит.';
            // проверка условия
            if (aqi <= 200) return 'Вредно';
            // проверка условия
            if (aqi <= 300) return 'Очень вредно';
            // возврат результата
            return 'Опасно';
        }

        // объявление функции
        function getAqiColorHex(aqi) {
            // проверка условия
            if (aqi === null) return '#828282';
            // проверка условия
            if (aqi <= 50) return '#009966';
            // проверка условия
            if (aqi <= 100) return '#ffde33';
            // проверка условия
            if (aqi <= 150) return '#ff9933';
            // проверка условия
            if (aqi <= 200) return '#cc0033';
            // проверка условия
            if (aqi <= 300) return '#660099';
            // возврат результата
            return '#7e0023';
        }

        const pinCache = {};
        // объявление функции
        function getOrCreatePin(colorHex) {
            // проверка условия
            if (pinCache[colorHex]) return pinCache[colorHex];

            const canvas = document.createElement('canvas');
            canvas.width = 40; canvas.height = 40;
            const ctx = canvas.getContext('2d');
            const cx = 20; const cy = 20;

            ctx.beginPath(); ctx.arc(cx, cy, 13.5, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = colorHex; ctx.fill();
            
            pinCache[colorHex] = canvas;
            // возврат результата
            return canvas;
        }

        // объявление функции
        function escapeHtml(s) {
            // возврат результата
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        // объявление функции
        async function renderStations(stations) {
            dataSource.entities.removeAll();
            entityPositions.length = 0; 
            clusterSet.clear(); 
            // проверка условия
            if (!Array.isArray(stations)) return;

            const seen = new Set();
            let count = 0;

            dataSource.entities.suspendEvents();

            // начало цикла
            for (const st of stations) {
                // проверка условия
                if (count >= config.maxStations) break;
                const lat = Number(st.lat), lon = Number(st.lon);
                // проверка условия
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

                const key = st.uid ? `u:${st.uid}` : `${lat.toFixed(3)},${lon.toFixed(3)}`;
                // проверка условия
                if (seen.has(key)) continue;
                seen.add(key);

                const aqi = parseAqi(st.aqi);
                const colorHex = getAqiColorHex(aqi);
                const aqiLabel = aqi === null ? '?' : String(aqi);
                const name = st?.station?.name || `AQI #${count + 1}`;
                const category = getAqiCategory(aqi);

                const labelText = `AQI: ${aqiLabel}\n${category}`;

                let desc = `<div style="font-family:sans-serif;padding:4px;">
                    <b>${escapeHtml(name)}</b><br>
                    AQI: <b>${aqiLabel}</b> (${escapeHtml(category)})<br>`;
                // проверка условия
                if (st?.station?.time) desc += `Обновлено: ${escapeHtml(st.station.time)}<br>`;
                // проверка условия
                if (st?.station?.url) desc += `<a href="${escapeHtml(st.station.url)}" target="_blank" style="color:#00ffcc;">Источник</a>`;
                desc += `</div>`;

                const position3d = Cesium.Cartesian3.fromDegrees(lon, lat);
                const pMag = Cesium.Cartesian3.magnitude(position3d);

                const entity = dataSource.entities.add({
                    name,
                    position: position3d,
                    billboard: {
                        image: getOrCreatePin(colorHex),
                        verticalOrigin: Cesium.VerticalOrigin.CENTER,
                        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        scale: new Cesium.CallbackProperty(function() {
                            // возврат результата
                            return entity._currentScale !== undefined ? entity._currentScale : 1.0;
                        }, false),
                        color: new Cesium.CallbackProperty(function() {
                            // возврат результата
                            return getAlphaColor(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                        }, false)
                    },
                    label: {
                        text: labelText,
                        font: 'bold 16px sans-serif',
                        fillColor: new Cesium.CallbackProperty(function() {
                            // возврат результата
                            return getAlphaColor(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                        }, false),
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        outlineColor: new Cesium.CallbackProperty(function() {
                            // возврат результата
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
                    description: desc
                });

                entity._currentScale = 0.0; 
                entity._currentAlpha = 1.0;
                entity._wasClustered = false;
                entity._lastClusteredFrame = -10;

                entityPositions.push({ entity, position: position3d, pMag });
                count++;

                // проверка условия
                if (count % 500 === 0) {
                    dataSource.entities.resumeEvents();
                    await new Promise(r => setTimeout(r, 10));
                    dataSource.entities.suspendEvents();
                }
            }
            
            dataSource.entities.resumeEvents();
        }

        // объявление функции
        async function loadStations(forceRefresh) {
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка AQI (весь мир)...') : null;
            setBusyState(true);
            
            await new Promise(r => setTimeout(r, 50)); 
            
            // начало блока перехвата ошибок
            try {
                // проверка условия
                if (!forceRefresh) {
                    const cached = readCache(config.cacheKey);
                    // проверка условия
                    if (cached) {
                        await renderStations(cached);
                        loadedOnce = true;
                        layerVisible = true;
                        applyVisibility();
                        // возврат результата
                        return true;
                    }
                }

                const stations = await requestAllTiles();
                await renderStations(stations);
                loadedOnce = true;
                writeCache(config.cacheKey, stations);
                layerVisible = true;
                applyVisibility();
                // возврат результата
                return true;
            } catch (err) {
                console.error('EnvironmentalVisualization error:', err);
                alert(`Ошибка загрузки AQI: ${err.message}`);
                // возврат результата
                return false;
            } finally {
                setBusyState(false);
                // проверка условия
                if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
            }
        }

        // возврат результата
        return {
            reload: () => loadStations(true),
            setEnabled: (enabled) => { layerVisible = Boolean(enabled); applyVisibility(); },
            isEnabled: () => layerVisible
        };
    }

    window.initEnvironmentalVisualization = initEnvironmentalVisualization;
})();