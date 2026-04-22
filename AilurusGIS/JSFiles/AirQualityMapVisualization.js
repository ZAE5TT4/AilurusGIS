/**
 * Глобальная тепловая карта качества воздуха (AQI).
 * Работает через Open-Meteo Air Quality API.
 * @param {Cesium.Viewer} viewer
 */
async function initAirQualityMapVisualization(viewer) {
    console.log('AirQualityMap: init AQI heatmap...');
    localStorage.removeItem('cesium_aqi_heatmap_cache_v3');

    let aqiHeatmapLayer = null;

    function readAqiHeatmapCache(expectedCount, allowStale = false) {
        const CACHE_KEY = 'cesium_aqi_heatmap_cache_v4';
        const CACHE_TIME_MS = 1000 * 60 * 60;
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (!cachedStr) {
            return [];
        }

        try {
            const parsed = JSON.parse(cachedStr);
            if (!parsed || !Array.isArray(parsed.data) || !parsed.timestamp) {
                return [];
            }

            const minimumCoverage = Math.floor(expectedCount * 0.85);
            if (parsed.data.length < minimumCoverage) {
                return [];
            }

            const isFresh = Date.now() - parsed.timestamp < CACHE_TIME_MS;
            if (isFresh || allowStale) {
                return parsed.data;
            }
        } catch (_e) {}

        return [];
    }

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

    const btnAqiMap = document.createElement('button');
    btnAqiMap.className = 'cesium-button cesium-toolbar-button';
    btnAqiMap.style.width = '30px';
    btnAqiMap.style.height = '30px';
    btnAqiMap.style.padding = '0';
    btnAqiMap.style.display = 'flex';
    btnAqiMap.style.justifyContent = 'center';
    btnAqiMap.style.alignItems = 'center';
    
    // Кнопка теперь доступна сразу!
    btnAqiMap.style.opacity = '1.0';
    btnAqiMap.style.pointerEvents = 'auto';
    btnAqiMap.title = 'Карта качества воздуха (Вкл/Выкл)';

    const iconAqiMap = document.createElement('img');
    iconAqiMap.src = 'Sprites/Icons/AirQualityMap.png';
    iconAqiMap.style.width = '20px';
    iconAqiMap.style.height = '20px';
    btnAqiMap.appendChild(iconAqiMap);
    uiContainer.insertBefore(btnAqiMap, uiContainer.firstChild);

    function buildAirQualityUrl(points) {
        const lats = points.map((loc) => loc.lat).join(',');
        const lons = points.map((loc) => loc.lon).join(',');
        const openMeteoApiKey = window.OPEN_METEO_API_KEY || window.OPEN_METEO_API_TOKEN || '';
        let url = `/api/open-meteo/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi`;
        if (openMeteoApiKey) {
            url += `&apikey=${openMeteoApiKey}`;
        }
        return url;
    }

    async function fetchAirQualityBatch(points) {
        const response = await fetch(buildAirQualityUrl(points));
        if (!response.ok) {
            throw new Error(`Open-Meteo HTTP ${response.status}`);
        }

        const data = await response.json();
        const list = Array.isArray(data) ? data : [data];
        return list.filter((d) => d && d.current);
    }

    async function fetchAirQualityGrid(points) {
        try {
            return await fetchAirQualityBatch(points);
        } catch (error) {
            if (points.length <= 32) {
                throw error;
            }

            const mid = Math.ceil(points.length / 2);
            const left = await fetchAirQualityGrid(points.slice(0, mid));
            await new Promise((resolve) => setTimeout(resolve, 400));
            const right = await fetchAirQualityGrid(points.slice(mid));
            return left.concat(right);
        }
    }

    let isLoaded = false;
    let isLoading = false;

    // Логика загрузки перенесена внутрь клика, чтобы не грузить карту при запуске
    btnAqiMap.addEventListener('click', async () => {
        if (isLoading) return;

        if (!isLoaded) {
            isLoading = true;
            btnAqiMap.style.opacity = '0.5';
            const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Генерация карты AQI...') : null;

            try {
                const gridLocations = [];
                for (let lat = -85; lat <= 85; lat += 10) {
                    for (let lon = -180; lon < 180; lon += 10) {
                        gridLocations.push({ lat, lon });
                    }
                }

                let results = [];
                const CACHE_KEY = 'cesium_aqi_heatmap_cache_v4';
                results = readAqiHeatmapCache(gridLocations.length, false);

                if (results.length === 0) {
                    try {
                        results = await fetchAirQualityGrid(gridLocations);
                    } catch (e) {
                        console.error('AQI heatmap load failed', e);
                    }

                    const minimumCoverage = Math.floor(gridLocations.length * 0.85);
                    if (results.length >= minimumCoverage) {
                        localStorage.setItem(CACHE_KEY, JSON.stringify({
                            timestamp: Date.now(),
                            data: results
                        }));
                    } else {
                        results = readAqiHeatmapCache(gridLocations.length, true);
                    }
                }

                if (results.length === 0) {
                    throw new Error('Нет данных AQI для создания тепловой карты');
                }

                const canvas = document.createElement('canvas');
                canvas.width = 2048;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.globalCompositeOperation = 'source-over';

                results.forEach((aqiData) => {
                    if (!aqiData || !aqiData.current || aqiData.current.us_aqi === undefined) return;

                    const lat = Number(aqiData.latitude);
                    const lon = Number(aqiData.longitude);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

                    const aqiValue = aqiData.current.us_aqi;
                    const x = (lon + 180) / 360 * canvas.width;
                    const y = (90 - lat) / 180 * canvas.height;
                    const radius = 90;

                    drawAqiHeatBlob(ctx, x, y, radius, aqiValue);
                    drawAqiHeatBlob(ctx, x - canvas.width, y, radius, aqiValue);
                    drawAqiHeatBlob(ctx, x + canvas.width, y, radius, aqiValue);
                });

                const heatmapProvider = new Cesium.SingleTileImageryProvider({
                    url: canvas.toDataURL('image/png'),
                    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
                });
                aqiHeatmapLayer = viewer.imageryLayers.addImageryProvider(heatmapProvider);
                aqiHeatmapLayer.alpha = 0.85;
                aqiHeatmapLayer.show = false;
                
                isLoaded = true;
            } catch (error) {
                console.error('AQI heatmap generation failed:', error);
                alert('Ошибка создания тепловой карты: ' + error.message);
            } finally {
                isLoading = false;
                btnAqiMap.style.opacity = '1.0';
                if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
            }
        }

        if (aqiHeatmapLayer) {
            aqiHeatmapLayer.show = !aqiHeatmapLayer.show;
            updateShadersForAqiHeatmap(viewer, aqiHeatmapLayer.show);
            viewer.scene.requestRender();
            btnAqiMap.style.backgroundColor = aqiHeatmapLayer.show ? 'rgba(38, 84, 121, 1)' : '';
        }
    });
}

function drawAqiHeatBlob(ctx, x, y, radius, aqi) {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grd.addColorStop(0.0, getAqiColorRGBA(aqi, 0.90));
    grd.addColorStop(0.3, getAqiColorRGBA(aqi, 0.70));
    grd.addColorStop(0.7, getAqiColorRGBA(aqi, 0.30));
    grd.addColorStop(1.0, getAqiColorRGBA(aqi, 0.00));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function getAqiColorRGBA(aqi, alpha) {
    if (aqi <= 50) return `rgba(0, 153, 102, ${alpha})`;
    if (aqi <= 100) return `rgba(255, 222, 51, ${alpha})`;
    if (aqi <= 150) return `rgba(255, 153, 51, ${alpha})`;
    if (aqi <= 200) return `rgba(204, 0, 51, ${alpha})`;
    if (aqi <= 300) return `rgba(102, 0, 153, ${alpha})`;
    return `rgba(126, 0, 35, ${alpha})`;
}

function updateShadersForAqiHeatmap(viewer, isHeatmapOn) {
    if (isHeatmapOn) {
        viewer.scene.fog.enabled = false;
        viewer.scene.globe.showGroundAtmosphere = false;

        for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
            const stage = viewer.scene.postProcessStages.get(i);
            if (stage === viewer.scene.postProcessStages.bloom || stage === viewer.scene.postProcessStages.fxaa) {
                continue;
            }
            if (stage.enabled) {
                stage._wasEnabledBeforeAqiMap = true;
                stage.enabled = false;
            }
        }
    } else {
        viewer.scene.fog.enabled = true;
        viewer.scene.globe.showGroundAtmosphere = true;

        for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
            const stage = viewer.scene.postProcessStages.get(i);
            if (stage._wasEnabledBeforeAqiMap) {
                stage.enabled = true;
                delete stage._wasEnabledBeforeAqiMap;
            }
        }
    }
}