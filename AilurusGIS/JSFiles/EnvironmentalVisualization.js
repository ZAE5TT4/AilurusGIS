(function () {
    /*
     * AQI stations.
     * Внешний вид точек и текстов сохранён как в старой версии:
     * бело-чёрная круглая иконка + цвет AQI, подпись "AQI / категория" рядом с точкой.
     * Оптимизация сделана без смены стиля: убраны покадровые CallbackProperty/анимации,
     * добавлены кэш, отбор по сетке и отображение подписей только на рабочей дистанции.
     */
    function initEnvironmentalVisualization(viewer, options) {
        if (!viewer || typeof Cesium === 'undefined') return null;

        function isMobileLike() {
            return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
                (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        }

        const mobileMode = isMobileLike();
        const config = Object.assign({
            bounds: { latMin: -85.0, lonMin: -180.0, latMax: 85.0, lonMax: 180.0 },
            maxStations: mobileMode ? 900 : 2200,
            cacheKey: 'cesium_aqi_bounds_cache_global_styled_fast_v1',
            cacheMs: 1000 * 60 * 60
        }, options || {});

        config.maxStations = Math.max(250, Math.min(
            Number(config.maxStations) || (mobileMode ? 900 : 2200),
            mobileMode ? 1200 : 2600
        ));

        const dataSource = new Cesium.CustomDataSource('AqicnStations');
        viewer.dataSources.add(dataSource);
        dataSource.show = false;

        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = mobileMode ? 105 : 85;
        dataSource.clustering.minimumClusterSize = mobileMode ? 3 : 4;

        const aqiClusterPinCache = Object.create(null);
        function getAqiClusterPin(count) {
            const label = count > 999 ? '999+' : String(count);
            let color = '#009966';
            if (count >= 100) color = '#cc0033';
            else if (count >= 50) color = '#ff9933';
            else if (count >= 20) color = '#ffde33';

            const key = `${label}_${color}`;
            if (aqiClusterPinCache[key]) return aqiClusterPinCache[key];

            const canvas = document.createElement('canvas');
            canvas.width = 56;
            canvas.height = 56;
            const ctx = canvas.getContext('2d');
            const cx = 28;
            const cy = 28;

            ctx.beginPath();
            ctx.arc(cx, cy, 26, 0, 2 * Math.PI);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            ctx.font = `bold ${label.length > 2 ? 12 : 15}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(label, cx, cy);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, cx, cy);

            aqiClusterPinCache[key] = canvas;
            return canvas;
        }

        dataSource.clustering.clusterEvent.addEventListener(function (clusteredEntities, cluster) {
            if (cluster.point) cluster.point.show = false;
            cluster.billboard.show = true;
            cluster.label.show = false;
            cluster.billboard.image = getAqiClusterPin(clusteredEntities.length);
            cluster.billboard.width = 56;
            cluster.billboard.height = 56;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            cluster.billboard.heightReference = Cesium.HeightReference.NONE;
            cluster.billboard.scale = 1.0;
        });

        let busy = false;
        let loadedOnce = false;
        let layerVisible = false;

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
        btnAqi.style.width = '30px';
        btnAqi.style.height = '30px';
        btnAqi.style.padding = '0';
        btnAqi.style.display = 'flex';
        btnAqi.style.justifyContent = 'center';
        btnAqi.style.alignItems = 'center';
        btnAqi.title = 'Станции качества воздуха (AQI)';

        const iconAqi = document.createElement('img');
        iconAqi.src = 'Sprites/Icons/AirQuality.png';
        iconAqi.style.width = '20px';
        iconAqi.style.height = '20px';
        btnAqi.appendChild(iconAqi);
        uiContainer.appendChild(btnAqi);

        btnAqi.addEventListener('click', async function () {
            if (busy) return;
            if (!loadedOnce) {
                await loadStations(false);
                return;
            }
            layerVisible = !layerVisible;
            applyVisibility();
        });

        function applyVisibility() {
            dataSource.show = layerVisible;
            btnAqi.style.backgroundColor = layerVisible ? 'rgba(38, 84, 121, 1)' : '';
            viewer.scene.requestRender();
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
            } catch (_e) {
                return null;
            }
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
            try {
                payload = JSON.parse(text);
            } catch (_e) {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                throw new Error('Invalid JSON');
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return payload;
        }

        async function requestBounds(bounds) {
            const token = window.AQICN_API_TOKEN || '68f7e90d5c4016cf4a7e1ebc8b685acf315a246d';
            const params = new URLSearchParams({
                latMin: String(bounds.latMin),
                lonMin: String(bounds.lonMin),
                latMax: String(bounds.latMax),
                lonMax: String(bounds.lonMax),
                token
            });

            try {
                const data = await fetchJson(`/api/aqi/bounds?${params}`);
                if (data.status !== 'ok') throw new Error('AQICN error');
                return data.data || [];
            } catch (_e) {
                const latlng = `${bounds.latMin},${bounds.lonMin},${bounds.latMax},${bounds.lonMax}`;
                const direct = await fetchJson(`https://api.waqi.info/map/bounds/?latlng=${encodeURIComponent(latlng)}&token=${encodeURIComponent(token)}`);
                if (direct.status !== 'ok') throw new Error('AQICN direct error');
                return direct.data || [];
            }
        }

        function splitGlobal() {
            const tiles = [];
            const latSteps = mobileMode ? 4 : 5;
            const lonSteps = mobileMode ? 6 : 7;
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
            const batchSize = mobileMode ? 2 : 3;
            for (let i = 0; i < tiles.length; i += batchSize) {
                const batch = tiles.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(tile => requestBounds(tile).catch(() => [])));
                results.forEach(result => {
                    if (Array.isArray(result)) all.push(...result);
                });
                if (i + batchSize < tiles.length) {
                    await new Promise(resolve => setTimeout(resolve, 180));
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

        const pinCache = Object.create(null);
        function getOrCreatePin(colorHex) {
            if (pinCache[colorHex]) return pinCache[colorHex];

            const canvas = document.createElement('canvas');
            canvas.width = 40;
            canvas.height = 40;
            const ctx = canvas.getContext('2d');
            const cx = 20;
            const cy = 20;

            ctx.beginPath();
            ctx.arc(cx, cy, 13.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 10.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
            ctx.fillStyle = colorHex;
            ctx.fill();

            pinCache[colorHex] = canvas;
            return canvas;
        }

        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function isSafeUrl(url) {
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch (_e) {
                return false;
            }
        }

        function stationScore(station) {
            const aqi = parseAqi(station.aqi);
            return aqi === null ? -1 : aqi;
        }

        function stationKey(station) {
            const lat = Number(station.lat);
            const lon = Number(station.lon);
            return station.uid ? `u:${station.uid}` : `${lat.toFixed(3)},${lon.toFixed(3)}`;
        }

        function prepareStations(stations) {
            if (!Array.isArray(stations)) return [];

            const seen = new Set();
            const deduped = [];
            for (const station of stations) {
                const lat = Number(station.lat);
                const lon = Number(station.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

                const key = stationKey(station);
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(station);
            }

            if (deduped.length <= config.maxStations) return deduped;

            const cellSize = mobileMode ? 8 : 5;
            const cells = new Map();
            for (const station of deduped) {
                const lat = Number(station.lat);
                const lon = Number(station.lon);
                const cellKey = `${Math.floor((lat + 90) / cellSize)}:${Math.floor((lon + 180) / cellSize)}`;
                const current = cells.get(cellKey);
                if (!current || stationScore(station) > stationScore(current)) {
                    cells.set(cellKey, station);
                }
            }

            const selected = Array.from(cells.values());
            const selectedKeys = new Set(selected.map(stationKey));

            if (selected.length < config.maxStations) {
                deduped
                    .slice()
                    .sort((a, b) => stationScore(b) - stationScore(a))
                    .some(station => {
                        const key = stationKey(station);
                        if (!selectedKeys.has(key)) {
                            selected.push(station);
                            selectedKeys.add(key);
                        }
                        return selected.length >= config.maxStations;
                    });
            }

            selected.sort((a, b) => stationScore(b) - stationScore(a));
            return selected.slice(0, config.maxStations);
        }

        async function renderStations(stations) {
            const visibleStations = prepareStations(stations);
            dataSource.entities.removeAll();
            if (visibleStations.length === 0) return;

            const labelMaxDistance = mobileMode ? 1200000 : 2000000;

            dataSource.entities.suspendEvents();
            try {
                for (let i = 0; i < visibleStations.length; i++) {
                    const st = visibleStations[i];
                    const lat = Number(st.lat);
                    const lon = Number(st.lon);
                    const aqi = parseAqi(st.aqi);
                    const colorHex = getAqiColorHex(aqi);
                    const aqiLabel = aqi === null ? '?' : String(aqi);
                    const name = st?.station?.name || `AQI #${i + 1}`;
                    const category = getAqiCategory(aqi);
                    const labelText = `AQI: ${aqiLabel}\n${category}`;

                    let desc = `<div style="font-family:sans-serif;padding:4px;">
                        <b>${escapeHtml(name)}</b><br>
                        AQI: <b>${aqiLabel}</b> (${escapeHtml(category)})<br>`;
                    if (st?.station?.time) desc += `Обновлено: ${escapeHtml(st.station.time)}<br>`;
                    if (st?.station?.url && isSafeUrl(st.station.url)) {
                        desc += `<a href="${escapeHtml(st.station.url)}" target="_blank" rel="noopener noreferrer" style="color:#00ffcc;">Источник</a>`;
                    }
                    desc += '</div>';

                    dataSource.entities.add({
                        name,
                        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
                        billboard: {
                            image: getOrCreatePin(colorHex),
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            scale: 1.0
                        },
                        label: {
                            text: labelText,
                            font: 'bold 14px sans-serif',
                            fillColor: Cesium.Color.WHITE,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 4,
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                            pixelOffset: new Cesium.Cartesian2(24, 0),
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            translucencyByDistance: new Cesium.NearFarScalar(500000, 1.0, 2000000, 0.0),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, labelMaxDistance),
                            showBackground: false
                        },
                        description: desc
                    });

                    if (i > 0 && i % 300 === 0) {
                        dataSource.entities.resumeEvents();
                        await new Promise(resolve => setTimeout(resolve, 0));
                        dataSource.entities.suspendEvents();
                    }
                }
            } finally {
                dataSource.entities.resumeEvents();
            }
        }

        async function loadStations(forceRefresh) {
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка AQI (весь мир)...') : null;
            setBusyState(true);

            try {
                let stations = null;
                if (!forceRefresh) stations = readCache(config.cacheKey);
                if (!stations) {
                    stations = await requestAllTiles();
                    writeCache(config.cacheKey, stations);
                }

                await renderStations(stations);
                loadedOnce = true;
                layerVisible = true;
                applyVisibility();
                return true;
            } catch (err) {
                console.error('EnvironmentalVisualization error:', err);
                alert(`Ошибка загрузки AQI: ${err.message}`);
                layerVisible = false;
                applyVisibility();
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
