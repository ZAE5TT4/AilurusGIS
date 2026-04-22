(function () {
    /**
     * Animated global wind flow overlay for Cesium.
     * ИСПРАВЛЕНИЯ:
     * - Идеальное скрытие "каши" на краях Земли за счет вычисления угла горизонта
     * - Частицы плавно растворяются, улетая за горизонт глобуса
     * @param {Cesium.Viewer} viewer
     * @param {{ apiKey?: string }} options
     */
    function initWindFlowVisualization(viewer, options) {
        const config = Object.assign({
            latMin: -80,
            latMax: 80,
            latStep: 25,
            lonMin: -180,
            lonMax: 170,
            lonStep: 25,
            chunkSize: 999,
            cacheKey: 'cesium_windflow_cache_v1',
            cacheMs: 1000 * 60 * 30,
            particleCount: 15000,
            activeParticleCount: 5000, // Базовое количество (будет динамически меняться)
            maxParticleAge: 120,
            minParticleAge: 40,
            simulationSpeed: 45000 
        }, options || {});

        const windData = new Map();
        const latCount = Math.floor((config.latMax - config.latMin) / config.latStep) + 1;
        const lonCount = Math.floor((config.lonMax - config.lonMin) / config.lonStep) + 1;

        let enabled = false;
        let ready = false;
        let destroyed = false;
        let lastError = null;
        let frameHandle = null;

        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '900';
        canvas.style.display = 'none';
        
        canvas.style.opacity = '1.0';
        canvas.style.mixBlendMode = 'normal'; 

        viewer.container.appendChild(canvas);
        const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
        const particles = [];

        function keyFor(lat, lon) { return `${lat.toFixed(2)},${lon.toFixed(2)}`; }
        function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
        function normalizeLon(lon) {
            let result = lon;
            while (result < -180) result += 360;
            while (result > 180) result -= 360;
            return result;
        }

        function resizeCanvas() {
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const width = Math.max(1, viewer.container.clientWidth);
            const height = Math.max(1, viewer.container.clientHeight);
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function tempToColor(tempC, alpha) {
            const t = clamp(tempC, -40, 45);
            let r, g, b;
            if (t < -20) { const f = (t + 40) / 20; r = Math.floor(138 * (1 - f)); g = 0; b = 255; }
            else if (t < 0) { const f = (t + 20) / 20; r = 0; g = Math.floor(255 * f); b = 255; }
            else if (t < 15) { const f = t / 15; r = Math.floor(255 * f); g = 255; b = Math.floor(255 * (1 - f)); }
            else if (t < 30) { const f = (t - 15) / 15; r = 255; g = Math.floor(255 * (1 - f)); b = 0; }
            else { const f = Math.min(1, (t - 30) / 15); r = Math.floor(255 - 100 * f); g = 0; b = 0; }
            
            const a = typeof alpha === 'number' ? Math.round(clamp(alpha, 0, 1) * 100) / 100 : 1;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }

        function generateGrid() {
            const points = [];
            for (let lat = config.latMin; lat <= config.latMax; lat += config.latStep) {
                for (let lon = config.lonMin; lon <= config.lonMax; lon += config.lonStep) {
                    points.push({ lat, lon });
                }
            }
            return points;
        }

        function buildForecastUrl(params) {
            const search = new URLSearchParams(params);
            if (config.apiKey) search.set('apikey', config.apiKey);
            return `/api/open-meteo/forecast?${search.toString()}`;
        }

        async function fetchJson(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Open-Meteo error: ${response.status}`);
            return response.json();
        }

        async function fetchWindFieldChunk(points) {
            const all = [];
            const lats = points.map(p => p.lat).join(',');
            const lons = points.map(p => p.lon).join(',');
            const params = new URLSearchParams({ latitude: lats, longitude: lons, current: 'temperature_2m,wind_speed_10m,wind_direction_10m' });
            const url = buildForecastUrl(params);
            const payload = await fetchJson(url);
            const list = Array.isArray(payload) ? payload : [payload];

            list.forEach((item, idx) => {
                if (!item || !item.current) return;
                const loc = points[idx];
                if (!loc) return;
                const speedKmh = Number(item.current.wind_speed_10m) || 0;
                const speedMs = speedKmh / 3.6;
                const deg = Number(item.current.wind_direction_10m) || 0;
                const dirRad = (deg * Math.PI) / 180;
                const u = -speedMs * Math.sin(dirRad);
                const v = -speedMs * Math.cos(dirRad);
                all.push({ lat: loc.lat, lon: loc.lon, temp: Number(item.current.temperature_2m) || 0, speedMs, u, v });
            });
            return all;
        }

        async function fetchWindField() {
            const points = generateGrid();
            try { return await fetchWindFieldChunk(points); } 
            catch (error) {
                if (points.length <= 1) throw error;
                const midpoint = Math.ceil(points.length / 2);
                const firstHalf = await fetchWindFieldChunk(points.slice(0, midpoint));
                await new Promise(resolve => setTimeout(resolve, 500));
                const secondHalf = await fetchWindFieldChunk(points.slice(midpoint));
                return firstHalf.concat(secondHalf);
            }
        }

        function writeField(items) { windData.clear(); items.forEach(it => windData.set(keyFor(it.lat, it.lon), it)); }

        function readCache() {
            try {
                const raw = localStorage.getItem(config.cacheKey);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.data) || !parsed.timestamp) return null;
                return { data: parsed.data, isFresh: Date.now() - parsed.timestamp <= config.cacheMs };
            } catch (_e) { return null; }
        }

        function writeCache(items) { try { localStorage.setItem(config.cacheKey, JSON.stringify({ timestamp: Date.now(), data: items })); } catch (_e) {} }

        function sampleWind(lat, lon) {
            const clampedLat = clamp(lat, config.latMin, config.latMax - 1e-6);
            const wrappedLon = normalizeLon(lon);
            const latPos = (clampedLat - config.latMin) / config.latStep;
            const lonPos = (wrappedLon - config.lonMin) / config.lonStep;
            const lat0 = Math.floor(latPos);
            const lon0 = Math.floor(lonPos);
            const lat1 = Math.min(lat0 + 1, latCount - 1);
            const lon1 = (lon0 + 1 + lonCount) % lonCount;
            const fy = latPos - lat0;
            const fx = lonPos - lon0;

            const p00 = windData.get(keyFor(config.latMin + lat0 * config.latStep, config.lonMin + lon0 * config.lonStep));
            const p10 = windData.get(keyFor(config.latMin + lat1 * config.latStep, config.lonMin + lon0 * config.lonStep));
            const p01 = windData.get(keyFor(config.latMin + lat0 * config.latStep, config.lonMin + lon1 * config.lonStep));
            const p11 = windData.get(keyFor(config.latMin + lat1 * config.latStep, config.lonMin + lon1 * config.lonStep));

            if (!p00 || !p10 || !p01 || !p11) return null;

            function lerp(a, b, t) { return a + (b - a) * t; }
            return {
                u: lerp(lerp(p00.u, p01.u, fx), lerp(p10.u, p11.u, fx), fy),
                v: lerp(lerp(p00.v, p01.v, fx), lerp(p10.v, p11.v, fx), fy),
                temp: lerp(lerp(p00.temp, p01.temp, fx), lerp(p10.temp, p11.temp, fx), fy),
                speedMs: lerp(lerp(p00.speedMs, p01.speedMs, fx), lerp(p10.speedMs, p11.speedMs, fx), fy)
            };
        }

        function randomParticle(particle) {
            particle.lon = -180 + Math.random() * 360;
            particle.lat = config.latMin + Math.random() * (config.latMax - config.latMin);
            particle.age = 0;
            particle.maxAge = config.minParticleAge + Math.floor(Math.random() * (config.maxParticleAge - config.minParticleAge));
        }

        function ensureParticles() {
            while (particles.length < config.particleCount) {
                const p = { lon: 0, lat: 0, age: 0, maxAge: 0 };
                randomParticle(p);
                particles.push(p);
            }
        }

        function project(lon, lat) {
            const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 1000);
            const transforms = Cesium.SceneTransforms;
            if (transforms && typeof transforms.wgs84ToWindowCoordinates === 'function') {
                return transforms.wgs84ToWindowCoordinates(viewer.scene, pos);
            }
            if (typeof viewer.scene.cartesianToCanvasCoordinates === 'function') {
                return viewer.scene.cartesianToCanvasCoordinates(pos);
            }
            return null;
        }

        function clearCanvasFull() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        function stepAndDraw() {
            const dtFixed = 0.016; 
            const cameraHeight = viewer.camera.positionCartographic ? viewer.camera.positionCartographic.height : 5000000;
            
            const lineWidth = 1.0; 
            const headLenPixels = 5.0; 
            const headWidthPixels = 2.5; 
            
            const zoomScale = Math.max(0.15, cameraHeight / 2000000.0);
            
            let zoomFactor = 1.0;
            if (cameraHeight > 3000000) {
                zoomFactor = clamp(3000000 / cameraHeight, 0.4, 1.0);
            } else if (cameraHeight < 1000000) {
                // Вблизи используем множитель до 3.0, что заполнит экран максимумом частиц из пула!
                zoomFactor = clamp(1000000 / cameraHeight, 1.0, 3.0);
            }

            const activeParticlesBase = config.activeParticleCount;
            const dynamicActiveParticles = Math.min(
                Math.floor(activeParticlesBase * zoomFactor), 
                particles.length 
            );
            
            const dynamicTailSegments = Math.max(3, Math.floor(10 * Math.min(zoomFactor, 1.2)));

            // === УМНОЕ РАСТВОРЕНИЕ НА ГОРИЗОНТЕ ===
            const cameraPos = viewer.camera.positionWC || viewer.camera.position;
            const camMag = Cesium.Cartesian3.magnitude(cameraPos);
            const earthR = 6378137.0; // Радиус земли
            const safeCamMag = Math.max(camMag, earthR + 100);
            const horizonAngle = Math.acos(earthR / safeCamMag);
            
            // Сдвигаем границу растворения частиц. Теперь они начинают пропадать
            // пройдя всего 70% от центра до горизонта, что полностью скроет искажения!
            const fadeStartAngle = horizonAngle * 0.70; 
            const fadeRange = horizonAngle - fadeStartAngle;

            clearCanvasFull();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const colorBuckets = {};

            for (let i = 0; i < dynamicActiveParticles; i += 1) {
                const p = particles[i];
                p.age += 1;

                if (p.age >= p.maxAge) { randomParticle(p); continue; }

                const field = sampleWind(p.lat, p.lon);
                if (!field || field.speedMs < 0.3) { randomParticle(p); continue; }

                const latRad = (p.lat * Math.PI) / 180;
                const dLat = (field.v * dtFixed * config.simulationSpeed) / 110540;
                const dLon = (field.u * dtFixed * config.simulationSpeed) / Math.max(20000, 111320 * Math.cos(latRad));

                const currLon = normalizeLon(p.lon + dLon);
                const currLat = clamp(p.lat + dLat, config.latMin, config.latMax);
                
                p.lon = currLon; 
                p.lat = currLat;

                // --- ЛОГИКА ИСЧЕЗНОВЕНИЯ НА КРАЯХ ЗЕМЛИ ---
                const pPos = Cesium.Cartesian3.fromDegrees(currLon, currLat, 0);
                const pMag = Cesium.Cartesian3.magnitude(pPos);
                
                // Косинус угла между камерой и частицей
                const dot = Cesium.Cartesian3.dot(cameraPos, pPos) / (camMag * pMag);
                const particleAngle = Math.acos(clamp(dot, -1.0, 1.0));
                
                // Если стрелка ушла за горизонт глобуса - даже не пытаемся ее рисовать
                if (particleAngle > horizonAngle) {
                    continue; 
                }

                // Плавное затухание (прозрачность) при приближении к самому краю
                let edgeAlpha = 1.0;
                if (particleAngle > fadeStartAngle && fadeRange > 0.001) {
                    edgeAlpha = clamp(1.0 - (particleAngle - fadeStartAngle) / fadeRange, 0.0, 1.0);
                }
                
                // Не тратим ресурсы на практически невидимые частицы
                if (edgeAlpha < 0.02) continue; 
                // ------------------------------------------

                const speedScale = clamp(field.speedMs / 10.0, 0.5, 2.5);
                const tailTimeStep = 0.03 * zoomScale * speedScale;

                const path = [];
                let tLon = currLon;
                let tLat = currLat;
                
                const startProj = project(tLon, tLat);
                if (!startProj) continue;
                path.push(startProj);

                for (let j = 0; j < dynamicTailSegments; j++) {
                    const tField = sampleWind(tLat, tLon);
                    if (!tField || tField.speedMs < 0.3) break;
                    
                    const tLatRad = (tLat * Math.PI) / 180;
                    const stepDLat = (tField.v * tailTimeStep * config.simulationSpeed) / 110540;
                    const stepDLon = (tField.u * tailTimeStep * config.simulationSpeed) / Math.max(20000, 111320 * Math.cos(tLatRad));

                    tLon = normalizeLon(tLon - stepDLon);
                    tLat = clamp(tLat - stepDLat, config.latMin, config.latMax);
                    
                    const projPos = project(tLon, tLat);
                    if (projPos) {
                        const prev = path[path.length - 1];
                        if (Math.hypot(projPos.x - prev.x, projPos.y - prev.y) > 150) break;
                        path.push(projPos);
                    } else {
                        break;
                    }
                }

                if (path.length < 2) continue;

                let totalLen = 0;
                for (let j = 0; j < path.length - 1; j++) {
                    totalLen += Math.hypot(path[j].x - path[j+1].x, path[j].y - path[j+1].y);
                }

                if (totalLen < 15) {
                    const p0 = path[0];
                    const p1 = path[path.length - 1];
                    let dx = p0.x - p1.x;
                    let dy = p0.y - p1.y;
                    let currentLen = Math.hypot(dx, dy);
                    
                    if (currentLen > 0.1) {
                        const scale = 15 / currentLen;
                        path.length = 2; 
                        path[1] = { x: p0.x - dx * scale, y: p0.y - dy * scale };
                    } else {
                        continue; 
                    }
                }

                let dx = path[0].x - path[1].x;
                let dy = path[0].y - path[1].y;
                let len = Math.hypot(dx, dy);
                
                if (len < 2.0 && path.length > 2) {
                    dx = path[0].x - path[path.length - 1].x;
                    dy = path[0].y - path[path.length - 1].y;
                    len = Math.hypot(dx, dy);
                }

                if (len < 0.1) continue;

                const ux = dx / len;
                const uy = dy / len;

                const tipX = path[0].x;
                const tipY = path[0].y;

                const arrowBaseX = tipX - ux * headLenPixels;
                const arrowBaseY = tipY - uy * headLenPixels;
                const lx = arrowBaseX - uy * headWidthPixels;
                const ly = arrowBaseY + ux * headWidthPixels;
                const rx = arrowBaseX + uy * headWidthPixels;
                const ry = arrowBaseY - ux * headWidthPixels;

                const fadeFrames = 15;
                let lifeAlpha = Math.min(clamp(p.age / fadeFrames, 0, 1), clamp((p.maxAge - p.age) / fadeFrames, 0, 1));
                
                // Умножаем прозрачность жизни на прозрачность "края Земли"
                lifeAlpha *= edgeAlpha;

                if (lifeAlpha < 0.05) continue;

                const colorStr = tempToColor(field.temp, lifeAlpha);
                
                if (!colorBuckets[colorStr]) {
                    colorBuckets[colorStr] = { shafts: [], heads: [] };
                }
                
                colorBuckets[colorStr].shafts.push(path);
                colorBuckets[colorStr].heads.push(tipX, tipY, lx, ly, rx, ry);
            }

            ctx.lineWidth = lineWidth;
            for (const color in colorBuckets) {
                const bucket = colorBuckets[color];
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                
                ctx.beginPath();
                for (let i = 0; i < bucket.shafts.length; i++) {
                    const path = bucket.shafts[i];
                    ctx.moveTo(path[0].x, path[0].y);
                    for (let j = 1; j < path.length; j++) {
                        ctx.lineTo(path[j].x, path[j].y);
                    }
                }
                ctx.stroke();

                ctx.beginPath();
                for (let i = 0; i < bucket.heads.length; i += 6) {
                    ctx.moveTo(bucket.heads[i], bucket.heads[i+1]); 
                    ctx.lineTo(bucket.heads[i+2], bucket.heads[i+3]); 
                    ctx.lineTo(bucket.heads[i+4], bucket.heads[i+5]); 
                    ctx.closePath();
                }
                ctx.fill();
            }
        }

        function frame(ts) {
            if (!enabled || destroyed) return;
            stepAndDraw();
            
            frameHandle = requestAnimationFrame(frame);
        }

        function setEnabled(state) {
            if (destroyed || !ready) return false;
            enabled = Boolean(state);
            canvas.style.display = enabled ? 'block' : 'none';

            if (!enabled) {
                if (frameHandle) { cancelAnimationFrame(frameHandle); frameHandle = null; }
                clearCanvasFull();
                return true;
            }

            if (!frameHandle) {
                frameHandle = requestAnimationFrame(frame);
            }
            return true;
        }

        function toggle() { setEnabled(!enabled); return enabled; }

        function destroy() {
            destroyed = true;
            setEnabled(false);
            window.removeEventListener('resize', resizeCanvas);
            if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        ensureParticles();

        const whenReady = (async () => {
            const cached = readCache();
            try {
                if (cached && cached.isFresh && cached.data.length) {
                    writeField(cached.data);
                } else {
                    const fresh = await fetchWindField();
                    writeField(fresh);
                    writeCache(fresh);
                }
                ready = windData.size > 0;
                return ready;
            } catch (error) {
                lastError = error;
                if (cached && cached.data.length) {
                    writeField(cached.data);
                    ready = windData.size > 0;
                    return ready;
                }
                ready = false;
                return false;
            }
        })();

        return { whenReady, setEnabled, toggle, destroy, isEnabled: () => enabled, isReady: () => ready, getLastError: () => lastError };
    }

    window.initWindFlowVisualization = initWindFlowVisualization;
})();