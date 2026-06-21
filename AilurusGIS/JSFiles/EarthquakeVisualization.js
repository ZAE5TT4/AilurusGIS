(function () {
    function initEarthquakeVisualization(viewer) {
        if (!viewer || typeof Cesium === 'undefined') return null;

        function isMobileLike() {
            return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
                (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        }

        const mobileMode = isMobileLike();
        const CACHE_KEY = 'cesium_earthquakes_2_5_week_styled_fast_v1';
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

        const dataSource = new Cesium.CustomDataSource('Earthquakes');
        viewer.dataSources.add(dataSource);
        dataSource.show = false;

        dataSource.clustering.enabled = true;
        dataSource.clustering.pixelRange = mobileMode ? 100 : 75;
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

        async function renderEarthquakes(features) {
            dataSource.entities.removeAll();
            if (!Array.isArray(features) || features.length === 0) return;

            const sorted = features
                .filter(eq => eq && eq.geometry && Array.isArray(eq.geometry.coordinates))
                .sort((a, b) => Number(b.properties?.time || 0) - Number(a.properties?.time || 0))
                .slice(0, mobileMode ? 700 : 1200);

            const labelMaxDistance = mobileMode ? 1800000 : 3000000;

            dataSource.entities.suspendEvents();
            try {
                for (let i = 0; i < sorted.length; i++) {
                    const eq = sorted[i];
                    const coords = eq.geometry.coordinates;
                    const lon = Number(coords[0]);
                    const lat = Number(coords[1]);
                    const depth = Number(coords[2] || 0);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

                    const props = eq.properties || {};
                    const mag = Number(props.mag || 0);
                    const colorHex = getColorByMag(mag);
                    const place = props.place || 'Неизвестно';
                    const timeStr = props.time ? new Date(props.time).toLocaleString('ru-RU') : '-';
                    const depthLabel = Number.isFinite(depth) ? depth : 0;

                    dataSource.entities.add({
                        name: `M${mag.toFixed(1)} · ${place}`,
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
                            text: `${place}\nM${mag.toFixed(1)} · Глубина: ${depthLabel} км · ${timeStr}`,
                            font: 'bold 16px sans-serif',
                            fillColor: Cesium.Color.WHITE,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 5,
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                            pixelOffset: new Cesium.Cartesian2(24, 0),
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            translucencyByDistance: new Cesium.NearFarScalar(1500000, 1.0, 3000000, 0.0),
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

        async function loadLayerOnce() {
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка данных USGS...') : null;
            setBusyState(true);

            try {
                const features = await fetchEarthquakes();
                await renderEarthquakes(features);
                loadedOnce = true;
                isActive = true;
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
    }

    window.initEarthquakeVisualization = initEarthquakeVisualization;
})();
