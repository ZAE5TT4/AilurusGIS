(function () {
    function initEarthquakeVisualization(viewer) {
        if (!viewer || typeof Cesium === 'undefined') return null;

        function isMobileLike() {
            return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
                (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        }

        const mobileMode = isMobileLike();
        const CACHE_KEY = 'cesium_earthquakes_2_5_week_virtual_v2';
        const CACHE_MS = 1000 * 60 * 10;
        const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';

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
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.padding = '0';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.title = 'Землетрясения (за 7 дней)';

        const icon = document.createElement('img');
        icon.src = 'Sprites/Icons/Earthquakes.png';
        icon.style.width = '20px';
        icon.style.height = '20px';
        btn.appendChild(icon);
        container.appendChild(btn);

        let isActive = false;
        let isBusy = false;
        let loadedOnce = false;
        let allEarthquakes = [];
        let renderedKey = '';
        let renderTimer = null;
        let renderRunning = false;
        let renderPending = false;

        const dataSource = new Cesium.CustomDataSource('Earthquakes');
        viewer.dataSources.add(dataSource);
        dataSource.show = false;

        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = mobileMode ? 95 : 70;
        dataSource.clustering.minimumClusterSize = mobileMode ? 3 : 4;

        const clusterPinCache = Object.create(null);
        const pinCache = Object.create(null);

        function getClusterColor(count) {
            if (count >= 50) return '#FF2200';
            if (count >= 20) return '#FF6600';
            if (count >= 10) return '#FFAA00';
            return '#FFEE00';
        }

        function getClusterPin(count, colorHex) {
            const label = count > 999 ? '999+' : String(count);
            const key = `${label}_${colorHex}`;
            if (clusterPinCache[key]) return clusterPinCache[key];

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
            ctx.fillStyle = colorHex;
            ctx.fill();

            ctx.font = `bold ${label.length > 2 ? 12 : 15}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(label, cx, cy);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, cx, cy);

            clusterPinCache[key] = canvas;
            return canvas;
        }

        dataSource.clustering.clusterEvent.addEventListener(function (clusteredEntities, cluster) {
            if (cluster.point) cluster.point.show = false;
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
            cluster.billboard.scale = 1.0;
        });

        function getColorByMag(mag) {
            if (mag >= 7) return '#FF2200';
            if (mag >= 6) return '#FF6600';
            if (mag >= 5) return '#FFAA00';
            if (mag >= 4) return '#FFEE00';
            return '#AAFFAA';
        }

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

        function setBusyState(value) {
            isBusy = value;
            btn.style.pointerEvents = value ? 'none' : 'auto';
            btn.style.opacity = value ? '0.5' : '1.0';
        }

        function applyVisibility() {
            dataSource.show = isActive;
            btn.style.backgroundColor = isActive ? 'rgba(38, 84, 121, 1)' : '';
            if (isActive && loadedOnce) scheduleRenderForCamera(10);
            viewer.scene.requestRender();
        }

        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function readCache() {
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.features)) return null;
                if (Date.now() - parsed.timestamp > CACHE_MS) return null;
                return parsed.features;
            } catch (_e) {
                return null;
            }
        }

        function writeCache(features) {
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), features }));
            } catch (_e) {}
        }

        async function fetchEarthquakes() {
            const cached = readCache();
            if (cached) return cached;

            const response = await fetch(FEED_URL);
            if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
            const data = await response.json();
            const features = Array.isArray(data.features) ? data.features : [];
            writeCache(features);
            return features;
        }

        function normalizeLon(lon) {
            let value = Number(lon);
            while (value < -180) value += 360;
            while (value > 180) value -= 360;
            return value;
        }

        function prepareEarthquakes(features) {
            if (!Array.isArray(features)) return [];
            const prepared = [];
            for (let i = 0; i < features.length; i++) {
                const eq = features[i];
                if (!eq || !eq.geometry || !Array.isArray(eq.geometry.coordinates)) continue;
                const coords = eq.geometry.coordinates;
                const lon = normalizeLon(coords[0]);
                const lat = Number(coords[1]);
                const depth = Number(coords[2] || 0);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

                const props = eq.properties || {};
                const mag = Number(props.mag || 0);
                const time = Number(props.time || 0);
                eq._latNum = lat;
                eq._lonNum = lon;
                eq._depthNum = Number.isFinite(depth) ? depth : 0;
                eq._magNum = Number.isFinite(mag) ? mag : 0;
                eq._timeNum = Number.isFinite(time) ? time : 0;
                eq._idSafe = props.ids || props.code || props.url || `${lat.toFixed(3)},${lon.toFixed(3)},${time}`;
                eq._score = eq._magNum * 10000000000000 + eq._timeNum;
                prepared.push(eq);
            }
            return prepared.sort((a, b) => b._score - a._score);
        }

        function getCameraHeight() {
            const carto = viewer.camera.positionCartographic;
            return carto && Number.isFinite(carto.height) ? carto.height : 20000000;
        }

        function radiansToDegrees(value) {
            return Cesium.Math.toDegrees(value);
        }

        function getViewBounds(height) {
            let rect = null;
            try {
                rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
            } catch (_e) {
                rect = null;
            }

            if (!rect || !Number.isFinite(rect.west) || !Number.isFinite(rect.east)) {
                return { fullWorld: true, latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 };
            }

            let west = normalizeLon(radiansToDegrees(rect.west));
            let east = normalizeLon(radiansToDegrees(rect.east));
            let south = Math.max(-90, radiansToDegrees(rect.south));
            let north = Math.min(90, radiansToDegrees(rect.north));
            const width = west <= east ? east - west : (180 - west) + (east + 180);
            const heightDeg = Math.abs(north - south);

            if (height > 26000000 || width >= 335 || heightDeg >= 160) {
                return { fullWorld: true, latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 };
            }

            const pad = height > 14000000 ? 18 : height > 7000000 ? 10 : height > 2500000 ? 5 : height > 800000 ? 2.2 : 0.8;
            south = Math.max(-90, south - pad);
            north = Math.min(90, north + pad);
            west = normalizeLon(west - pad);
            east = normalizeLon(east + pad);

            return { fullWorld: false, latMin: south, latMax: north, lonMin: west, lonMax: east };
        }

        function lonInside(lon, west, east) {
            if (west <= east) return lon >= west && lon <= east;
            return lon >= west || lon <= east;
        }

        function insideBounds(item, bounds) {
            if (bounds.fullWorld) return true;
            return item._latNum >= bounds.latMin && item._latNum <= bounds.latMax && lonInside(item._lonNum, bounds.lonMin, bounds.lonMax);
        }

        function getActiveLimit(height) {
            if (mobileMode) {
                if (height > 16000000) return 55;
                if (height > 7000000) return 90;
                if (height > 2500000) return 130;
                return 170;
            }
            if (height > 16000000) return 140;
            if (height > 7000000) return 230;
            if (height > 2500000) return 330;
            return 440;
        }

        function getCellSize(height) {
            if (height > 16000000) return 10;
            if (height > 7000000) return 5;
            if (height > 2500000) return 2;
            if (height > 800000) return 0.75;
            return 0.25;
        }

        function earthquakeKey(eq) {
            return String(eq._idSafe || `${eq._latNum.toFixed(3)},${eq._lonNum.toFixed(3)},${eq._timeNum}`);
        }

        function selectByGeoGrid(items, limit, cellSize, fillCellSize) {
            const sorted = items.slice().sort((a, b) => (b._score || 0) - (a._score || 0));
            const selected = [];
            const selectedKeys = new Set();
            const usedCells = new Set();

            for (const item of sorted) {
                if (selected.length >= limit) break;
                const cellKey = `${Math.floor((item._latNum + 90) / cellSize)}:${Math.floor((item._lonNum + 180) / cellSize)}`;
                if (usedCells.has(cellKey)) continue;
                usedCells.add(cellKey);
                const key = earthquakeKey(item);
                selectedKeys.add(key);
                selected.push(item);
            }

            if (selected.length < limit) {
                const fillCells = new Set();
                for (const item of selected) {
                    fillCells.add(`${Math.floor((item._latNum + 90) / fillCellSize)}:${Math.floor((item._lonNum + 180) / fillCellSize)}`);
                }
                for (const item of sorted) {
                    if (selected.length >= limit) break;
                    const key = earthquakeKey(item);
                    if (selectedKeys.has(key)) continue;
                    const cellKey = `${Math.floor((item._latNum + 90) / fillCellSize)}:${Math.floor((item._lonNum + 180) / fillCellSize)}`;
                    if (fillCells.has(cellKey)) continue;
                    fillCells.add(cellKey);
                    selectedKeys.add(key);
                    selected.push(item);
                }
            }

            if (selected.length < limit) {
                for (const item of sorted) {
                    if (selected.length >= limit) break;
                    const key = earthquakeKey(item);
                    if (selectedKeys.has(key)) continue;
                    selectedKeys.add(key);
                    selected.push(item);
                }
            }

            return selected;
        }

        function getRenderSelection() {
            const height = getCameraHeight();
            const bounds = getViewBounds(height);
            const limit = getActiveLimit(height);
            const candidates = allEarthquakes.filter(eq => insideBounds(eq, bounds));
            const source = candidates.length > 0 ? candidates : allEarthquakes;
            const cellSize = getCellSize(height);
            const fillCellSize = Math.max(0.08, cellSize / 2.5);
            const selected = selectByGeoGrid(source, limit, cellSize, fillCellSize);
            const key = selected.map(earthquakeKey).join('|');
            return { selected, key };
        }

        async function renderSelection(selected, key) {
            if (renderedKey === key) return;
            renderedKey = key;
            dataSource.entities.removeAll();
            if (!Array.isArray(selected) || selected.length === 0) return;

            const labelMaxDistance = mobileMode ? 1900000 : 3200000;

            dataSource.entities.suspendEvents();
            try {
                for (let i = 0; i < selected.length; i++) {
                    const eq = selected[i];
                    const lon = eq._lonNum;
                    const lat = eq._latNum;
                    const depth = eq._depthNum;
                    const props = eq.properties || {};
                    const mag = eq._magNum;
                    const colorHex = getColorByMag(mag);
                    const place = props.place || 'Неизвестно';
                    const timeStr = eq._timeNum ? new Date(eq._timeNum).toLocaleString('ru-RU') : '-';
                    const depthLabel = Number.isFinite(depth) ? depth : 0;

                    dataSource.entities.add({
                        name: `M${mag.toFixed(1)} · ${place}`,
                        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
                        billboard: {
                            image: getOrCreatePin(colorHex),
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                            heightReference: Cesium.HeightReference.NONE,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            scale: 1.0
                        },
                        label: {
                            text: `${place}\nM${mag.toFixed(1)} · Глубина: ${depthLabel} км · ${timeStr}`,
                            font: 'bold 16px sans-serif',
                            fillColor: Cesium.Color.WHITE,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 5,
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                            pixelOffset: new Cesium.Cartesian2(24, 0),
                            heightReference: Cesium.HeightReference.NONE,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            translucencyByDistance: new Cesium.NearFarScalar(1500000, 1.0, labelMaxDistance, 0.0),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, labelMaxDistance),
                            showBackground: false
                        },
                        description: `
                            <div style="font-family:sans-serif;padding:5px;">
                                <h3 style="margin:0 0 8px;">Магнитуда: ${mag.toFixed(1)}</h3>
                                <p style="margin:3px 0;"><b>Место:</b> ${escapeHtml(place)}</p>
                                <p style="margin:3px 0;"><b>Глубина:</b> ${escapeHtml(depthLabel)} км</p>
                                <p style="margin:3px 0;"><b>Время:</b> ${escapeHtml(timeStr)}</p>
                            </div>
                        `
                    });

                    if (i > 0 && i % 120 === 0) {
                        dataSource.entities.resumeEvents();
                        await new Promise(resolve => setTimeout(resolve, 0));
                        dataSource.entities.suspendEvents();
                    }
                }
            } finally {
                dataSource.entities.resumeEvents();
            }
            viewer.scene.requestRender();
        }

        async function processRenderQueue() {
            if (renderRunning) return;
            renderRunning = true;
            try {
                while (renderPending && isActive && loadedOnce) {
                    renderPending = false;
                    const { selected, key } = getRenderSelection();
                    await renderSelection(selected, key);
                }
            } finally {
                renderRunning = false;
            }
        }

        function scheduleRenderForCamera(delay) {
            if (!loadedOnce || !isActive) return;
            renderPending = true;
            clearTimeout(renderTimer);
            renderTimer = setTimeout(processRenderQueue, Number.isFinite(delay) ? delay : 120);
        }

        const removeMoveEnd = viewer.camera.moveEnd.addEventListener(function () {
            scheduleRenderForCamera(80);
        });

        const resizeHandler = function () {
            scheduleRenderForCamera(120);
        };
        window.addEventListener('resize', resizeHandler);

        async function loadLayerOnce() {
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка данных USGS...') : null;
            setBusyState(true);

            try {
                const features = await fetchEarthquakes();
                allEarthquakes = prepareEarthquakes(features);
                renderedKey = '';
                loadedOnce = true;
                isActive = true;
                const initialSelection = getRenderSelection();
                await renderSelection(initialSelection.selected, initialSelection.key);
                applyVisibility();
            } catch (err) {
                console.error('EarthquakeVisualization error:', err);
                alert(`Ошибка загрузки данных о землетрясениях: ${err.message}`);
                isActive = false;
                applyVisibility();
            } finally {
                setBusyState(false);
                if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
            }
        }

        btn.addEventListener('click', async () => {
            if (isBusy) return;

            if (!loadedOnce) {
                await loadLayerOnce();
                return;
            }

            isActive = !isActive;
            applyVisibility();
        });

        return {
            reload: async () => {
                loadedOnce = false;
                allEarthquakes = [];
                renderedKey = '';
                await loadLayerOnce();
            },
            setEnabled: (enabled) => { isActive = Boolean(enabled); applyVisibility(); },
            isEnabled: () => isActive,
            destroy: () => {
                clearTimeout(renderTimer);
                if (typeof removeMoveEnd === 'function') removeMoveEnd();
                window.removeEventListener('resize', resizeHandler);
                viewer.dataSources.remove(dataSource, true);
            }
        };
    }

    window.initEarthquakeVisualization = initEarthquakeVisualization;
})();
