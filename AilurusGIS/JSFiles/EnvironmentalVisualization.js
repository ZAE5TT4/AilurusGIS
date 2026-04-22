(function () {
    /**
     * AQI станции — глобальное покрытие.
     * Текст появляется плавно при приближении, иконки стиля "Прогноз погоды".
     * ЭКСТРЕМАЛЬНАЯ ОПТИМИЗАЦИЯ: Кэширование иконок и асинхронный рендеринг для устранения фризов.
     * ИСПРАВЛЕНИЯ v5:
     * - Ускорена анимация масштаба (Bloom-эффект) при соединении/отсоединении кластеров
     */
    function initEnvironmentalVisualization(viewer, options) {
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

        // === КЛАСТЕРИЗАЦИЯ AQI СТАНЦИЙ ===
        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = 60; 
        dataSource.clustering.minimumClusterSize = 4;

        const _aqiClusterPinCache = {};
        function _getAqiClusterPin(count) {
            if (_aqiClusterPinCache[count]) return _aqiClusterPinCache[count];
            
            let color = '#009966';
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
                if (!layerVisible || entityPositions.length === 0) return;

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

                // 1. Точки станций
                for (let i = 0; i < entityPositions.length; i++) {
                    const item = entityPositions[i];
                    const entity = item.entity;
                    const pPos = item.position;
                    const pMag = item.pMag;

                    const isClustered = entity._lastClusteredFrame >= frameCount - 2;

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

                    entity._currentAlpha = alpha;
                }

                // 2. Кластеры станций
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

                    // Ускоренная анимация появления кластера
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

        let uiContainer = document.getElementById('environmentUiContainer');
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
            if (busy) return;
            if (!loadedOnce) {
                const ok = await loadStations(false);
                return;
            }
            layerVisible = !layerVisible;
            applyVisibility();
        });

        function applyVisibility() {
            dataSource.show = layerVisible;
            btnAqi.style.backgroundColor = layerVisible ? 'rgba(38, 84, 121, 1)' : '';
            if (layerVisible) {
                setupEdgeFade();
            } else {
                teardownEdgeFade();
            }
        }

        function setBusyState(isBusy) {
            busy = isBusy;
            btnAqi.style.pointerEvents = isBusy ? 'none' : 'auto';
            btnAqi.style.opacity = isBusy ? '0.5' : '1.0';
        }

        function readCache(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.data)) return null;
                if (Date.now() - parsed.timestamp > config.cacheMs) return null;
                return parsed.data;
            } catch (_e) { return null; }
        }

        function writeCache(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
            } catch (_e) {}
        }

        async function fetchJson(url) {
            const response = await fetch(url);
            const text = await response.text();
            let payload = null;
            try { payload = JSON.parse(text); } catch (_e) {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                throw new Error('Invalid JSON');
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return payload;
        }

        async function requestBounds(bounds) {
            const token = window.AQICN_API_TOKEN || '68f7e90d5c4016cf4a7e1ebc8b685acf315a246d';
            const params = new URLSearchParams({
                latMin: String(bounds.latMin), lonMin: String(bounds.lonMin),
                latMax: String(bounds.latMax), lonMax: String(bounds.lonMax),
                token
            });
            try {
                const data = await fetchJson(`/api/aqi/bounds?${params}`);
                if (data.status !== 'ok') throw new Error('AQICN error');
                return data.data || [];
            } catch (e) {
                const latlng = `${bounds.latMin},${bounds.lonMin},${bounds.latMax},${bounds.lonMax}`;
                const direct = await fetchJson(`https://api.waqi.info/map/bounds/?latlng=${encodeURIComponent(latlng)}&token=${encodeURIComponent(token)}`);
                if (direct.status !== 'ok') throw new Error('AQICN direct error');
                return direct.data || [];
            }
        }

        function splitGlobal() {
            const tiles = [];
            const latSteps = 6, lonSteps = 8;
            const latSize = 170 / latSteps; 
            const lonSize = 360 / lonSteps;
            for (let i = 0; i < latSteps; i++) {
                for (let j = 0; j < lonSteps; j++) {
                    tiles.push({
                        latMin: -85 + i * latSize,
                        latMax: -85 + (i + 1) * latSize,
                        lonMin: -180 + j * lonSize,
                        lonMax: -180 + (j + 1) * lonSize
                    });
                }
            }
            return tiles;
        }

        async function requestAllTiles() {
            const tiles = splitGlobal();
            const all = [];
            const batchSize = 4;
            for (let i = 0; i < tiles.length; i += batchSize) {
                const batch = tiles.slice(i, i + batchSize);
                const results = await Promise.all(
                    batch.map(tile => requestBounds(tile).catch(() => []))
                );
                results.forEach(r => { if (Array.isArray(r)) all.push(...r); });
                if (i + batchSize < tiles.length) {
                    await new Promise(r => setTimeout(r, 250));
                }
            }
            return all;
        }

        function parseAqi(raw) {
            if (raw === null || raw === undefined || raw === '-') return null;
            const n = Number(raw);
            return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
        }

        function getAqiCategory(aqi) {
            if (aqi === null) return 'Нет данных';
            if (aqi <= 50) return 'Хорошо';
            if (aqi <= 100) return 'Умеренно';
            if (aqi <= 150) return 'Вредно чувствит.';
            if (aqi <= 200) return 'Вредно';
            if (aqi <= 300) return 'Очень вредно';
            return 'Опасно';
        }

        function getAqiColorHex(aqi) {
            if (aqi === null) return '#828282';
            if (aqi <= 50) return '#009966';
            if (aqi <= 100) return '#ffde33';
            if (aqi <= 150) return '#ff9933';
            if (aqi <= 200) return '#cc0033';
            if (aqi <= 300) return '#660099';
            return '#7e0023';
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

        function escapeHtml(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        async function renderStations(stations) {
            dataSource.entities.removeAll();
            entityPositions.length = 0; 
            clusterSet.clear(); 
            if (!Array.isArray(stations)) return;

            const seen = new Set();
            let count = 0;

            dataSource.entities.suspendEvents();

            for (const st of stations) {
                if (count >= config.maxStations) break;
                const lat = Number(st.lat), lon = Number(st.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

                const key = st.uid ? `u:${st.uid}` : `${lat.toFixed(3)},${lon.toFixed(3)}`;
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
                if (st?.station?.time) desc += `Обновлено: ${escapeHtml(st.station.time)}<br>`;
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
                            return entity._currentScale !== undefined ? entity._currentScale : 1.0;
                        }, false),
                        color: new Cesium.CallbackProperty(function() {
                            return getAlphaColor(entity._currentAlpha !== undefined ? entity._currentAlpha : 1.0);
                        }, false)
                    },
                    label: {
                        text: labelText,
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
                    description: desc
                });

                entity._currentScale = 0.0; 
                entity._currentAlpha = 1.0;
                entity._wasClustered = false;
                entity._lastClusteredFrame = -10;

                entityPositions.push({ entity, position: position3d, pMag });
                count++;

                if (count % 500 === 0) {
                    dataSource.entities.resumeEvents();
                    await new Promise(r => setTimeout(r, 10));
                    dataSource.entities.suspendEvents();
                }
            }
            
            dataSource.entities.resumeEvents();
        }

        async function loadStations(forceRefresh) {
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка AQI (весь мир)...') : null;
            setBusyState(true);
            
            await new Promise(r => setTimeout(r, 50)); 
            
            try {
                if (!forceRefresh) {
                    const cached = readCache(config.cacheKey);
                    if (cached) {
                        await renderStations(cached);
                        loadedOnce = true;
                        layerVisible = true;
                        applyVisibility();
                        return true;
                    }
                }

                const stations = await requestAllTiles();
                await renderStations(stations);
                loadedOnce = true;
                writeCache(config.cacheKey, stations);
                layerVisible = true;
                applyVisibility();
                return true;
            } catch (err) {
                console.error('EnvironmentalVisualization error:', err);
                alert(`Ошибка загрузки AQI: ${err.message}`);
                return false;
            } finally {
                setBusyState(false);
                if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
            }
        }

        return {
            reload: () => loadStations(true),
            setEnabled: (enabled) => { layerVisible = Boolean(enabled); applyVisibility(); },
            isEnabled: () => layerVisible
        };
    }

    window.initEnvironmentalVisualization = initEnvironmentalVisualization;
})();