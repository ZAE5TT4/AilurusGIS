(function () {
    // объявление функции
    function initSatelliteVisualization(viewer) {
        let container = document.getElementById('satUiContainer');
        // проверка условия
        if (!container) {
            container = document.createElement('div');
            container.id = 'satUiContainer';
            container.style.position = 'absolute';
            container.style.top = '215px'; 
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            container.style.gap = '10px';
            viewer.container.appendChild(container);
            
            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `#satUiContainer { left: var(--panel-offset, 15px) !important; transition: left 0.3s ease-in-out !important; }`;
            document.head.appendChild(syncStyles);
        } else {
            container.style.display = 'flex';
            container.style.gap = '10px';
        }

        // кнопка "все активные спутники"
        const btnAll = document.createElement('button');
        btnAll.className = 'cesium-button cesium-toolbar-button';
        btnAll.style.width = '30px'; btnAll.style.height = '30px'; btnAll.style.padding = '0';
        btnAll.style.display = 'flex'; btnAll.style.justifyContent = 'center'; btnAll.style.alignItems = 'center';
        btnAll.title = 'Спутники (все активные)';

        const iconAll = document.createElement('img');
        iconAll.src = 'Sprites/Icons/Satellite.png';
        iconAll.style.width = '20px'; iconAll.style.height = '20px';
        btnAll.appendChild(iconAll);
        container.appendChild(btnAll);

        // кнопка starlink
        const btnStarlink = document.createElement('button');
        btnStarlink.className = 'cesium-button cesium-toolbar-button';
        btnStarlink.style.width = '30px'; btnStarlink.style.height = '30px'; btnStarlink.style.padding = '0';
        btnStarlink.style.display = 'flex'; btnStarlink.style.justifyContent = 'center'; btnStarlink.style.alignItems = 'center';
        btnStarlink.title = 'Спутники Starlink';

        const iconStarlink = document.createElement('img');
        iconStarlink.src = 'Sprites/Icons/Satellite.png';
        iconStarlink.style.width = '20px'; iconStarlink.style.height = '20px';
        iconStarlink.style.filter = 'hue-rotate(120deg)'; // Зеленоватый оттенок для различия
        btnStarlink.appendChild(iconStarlink);
        container.appendChild(btnStarlink);

        let isActiveAll = false;
        let isActiveStarlink = false;
        let isBusyAll = false;
        let isBusyStarlink = false;

        let satellitesAll = [];
        let satellitesStarlink = [];
        let satPrimitivesAll = null;
        let satPrimitivesStarlink = null;
        let orbitLine = null;
        let nightLayer = null;
        let originalBaseColor = null;
        let renderListenerAll = null;
        let renderListenerStarlink = null;

        const infoPanel = document.createElement('div');
        infoPanel.style.position = 'absolute';
        infoPanel.style.top = '15px';
        infoPanel.style.left = 'calc(var(--panel-offset, 15px) + 100px)';
        infoPanel.style.backgroundColor = 'rgba(20, 25, 30, 0.9)';
        infoPanel.style.color = '#00ffcc';
        infoPanel.style.border = '1px solid #00ffcc';
        infoPanel.style.padding = '10px';
        infoPanel.style.borderRadius = '5px';
        infoPanel.style.fontFamily = 'monospace';
        infoPanel.style.display = 'none';
        infoPanel.style.pointerEvents = 'none';
        infoPanel.style.transition = 'left 0.3s ease-in-out';
        viewer.container.appendChild(infoPanel);

        // объявление функции
        async function ensureSatelliteLib() {
            // проверка условия
            if (typeof satellite !== 'undefined') return;
            // загружаем через наш сервер чтобы обойти cors
            const cdns = [
                '/api/satellite-js',                                          // Наш серверный прокси (приоритет)
                'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js',
                'https://unpkg.com/satellite.js@4.0.0/satellite.min.js'
            ];

            // начало цикла
            for (const url of cdns) {
                // начало блока перехвата ошибок
                try {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = url;
                        script.crossOrigin = "anonymous";
                        script.onload = () => {
                            // проверка условия
                            if (typeof satellite !== 'undefined') resolve();
                            else reject(new Error("satellite объект не найден после загрузки"));
                        };
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                    // возврат результата
                    return;
                } catch (e) {
                    console.warn(`Не удалось загрузить satellite.js с ${url}:`, e.message);
                }
            }
            throw new Error("Не удалось загрузить satellite.js ни с одного источника. Проверь доступность cdnjs.cloudflare.com.");
        }

        // объявление функции
        function parseTLE(tleText) {
            const lines = tleText.trim().split('\n').map(l => l.trim()).filter(Boolean);
            const result = [];
            // начало цикла
            for (let i = 0; i + 2 < lines.length; i += 3) {
                const name = lines[i];
                const tle1 = lines[i + 1];
                const tle2 = lines[i + 2];
                // проверка условия
                if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
                    // начало блока перехвата ошибок
                    try {
                        const satrec = satellite.twoline2satrec(tle1, tle2);
                        result.push({ name, satrec });
                    } catch(e) { /* пропускаем битые tle */ }
                }
            }
            // возврат результата
            return result;
        }

        // объявление функции
        function updateSatellitesArray(satArray, primitives) {
            // проверка условия
            if (!primitives) return;
            const now = new Date();
            const gmst = satellite.gstime(now);
            // начало цикла
            for (let i = 0; i < satArray.length; i++) {
                const sat = satArray[i];
                const pv = satellite.propagate(sat.satrec, now);
                // проверка условия
                if (pv.position) {
                    const posGd = satellite.eciToGeodetic(pv.position, gmst);
                    const lon = posGd.longitude;
                    const lat = posGd.latitude;
                    const height = posGd.height * 1000;
                    // проверка условия
                    if (!isNaN(lon) && !isNaN(lat) && !isNaN(height) && height > 0) {
                        sat.primitive.position = Cesium.Cartesian3.fromRadians(lon, lat, height);
                    }
                }
            }
        }

        // объявление функции
        function drawOrbit(sat) {
            // проверка условия
            if (orbitLine) { viewer.entities.remove(orbitLine); orbitLine = null; }
            // проверка условия
            if (!sat) { infoPanel.style.display = 'none'; return; }

            const positions = [];
            const now = new Date();
            // начало цикла
            for (let i = 0; i <= 100; i++) {
                const time = new Date(now.getTime() + i * 60000); 
                const p = satellite.propagate(sat.satrec, time);
                // проверка условия
                if (p.position) {
                    const gmst = satellite.gstime(time);
                    const posGd = satellite.eciToGeodetic(p.position, gmst);
                    const h = posGd.height * 1000;
                    // проверка условия
                    if (h > 0) {
                        positions.push(Cesium.Cartesian3.fromRadians(posGd.longitude, posGd.latitude, h));
                    }
                }
            }

            // проверка условия
            if (positions.length > 1) {
                orbitLine = viewer.entities.add({
                    polyline: {
                        positions: positions,
                        width: 2,
                        material: new Cesium.PolylineGlowMaterialProperty({
                            glowPower: 0.2,
                            color: Cesium.Color.CYAN
                        })
                    }
                });
            }

            let heightKm = 0;
            // проверка условия
            if (sat.primitive && sat.primitive.position) {
                const cart = Cesium.Cartographic.fromCartesian(sat.primitive.position);
                heightKm = cart ? Math.round(cart.height / 1000) : 0;
            }
            infoPanel.innerHTML = `Спутник: <b>${sat.name}</b><br>Высота: ~${heightKm} км`;
            infoPanel.style.display = 'block';
        }

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(function (click) {
            // проверка условия
            if (!isActiveAll && !isActiveStarlink) return;
            const picked = viewer.scene.pick(click.position);
            // проверка условия
            if (Cesium.defined(picked) && picked.primitive && picked.primitive._satelliteData) {
                drawOrbit(picked.primitive._satelliteData);
            } else {
                drawOrbit(null);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // объявление функции
        async function fetchTLE(group) {
            // используем серверный прокси (flask) который без cors ограничений с запрос
            const proxyUrl = `/api/tle?group=${group}`;
            const response = await fetch(proxyUrl);
            // проверка условия
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status} при загрузке TLE для группы ${group}`);
            }
            const text = await response.text();
            // проверка условия
            if (!text || text.length < 100) {
                throw new Error(`Сервер вернул пустой ответ для группы ${group}`);
            }
            // возврат результата
            return text;
        }

        // объявление функции
        function enableDarkMode() {
            originalBaseColor = viewer.scene.globe.baseColor;
            viewer.scene.globe.baseColor = new Cesium.Color(0.01, 0.01, 0.02, 1.0);
        }

        // объявление функции
        function disableDarkModeIfNoneActive() {
            // проверка условия
            if (!isActiveAll && !isActiveStarlink) {
                // проверка условия
                if (originalBaseColor) {
                    viewer.scene.globe.baseColor = originalBaseColor;
                } else {
                    viewer.scene.globe.baseColor = Cesium.Color.WHITE;
                }
                // проверка условия
                if (nightLayer) {
                    viewer.imageryLayers.remove(nightLayer);
                    nightLayer = null;
                }
                // восстанавливаем освещение и солнце если день/ночь панель не активна
                // (DayNightVisualization сам управляет этими свойствами когда активен)
                const dnPanel = document.getElementById('dayNightPanel');
                const dnIsActive = dnPanel && dnPanel.style.display !== 'none';
                if (!dnIsActive) {
                    viewer.scene.globe.enableLighting = false;
                    viewer.scene.sun.show = false;
                }
            }
        }

        // объявление функции
        async function activateLayer(group, color, isBusyRef, btnRef) {
            await ensureSatelliteLib();

            // проверка условия
            if (!nightLayer) {
                enableDarkMode();
                // включаем освещение чтобы Cesium знал где день и где ночь
                viewer.scene.globe.enableLighting = true;
                viewer.scene.sun.show = true;
                const provider = await Cesium.IonImageryProvider.fromAssetId(3812);
                nightLayer = viewer.imageryLayers.addImageryProvider(provider);
                // показываем ночные тайлы ТОЛЬКО на тёмной стороне, на дневной — прозрачные
                nightLayer.dayAlpha = 0.0;
                nightLayer.nightAlpha = 0.8;
                nightLayer.alpha = 1.0;
            }

            const tleData = await fetchTLE(group);
            const parsedSats = parseTLE(tleData);

            const primitives = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
            const satArray = [];
            
            const now = new Date();
            const gmst = satellite.gstime(now);

            parsedSats.forEach(sat => {
                const p = satellite.propagate(sat.satrec, now);
                // проверка условия
                if (p.position) {
                    const posGd = satellite.eciToGeodetic(p.position, gmst);
                    const h = posGd.height * 1000;
                    // проверка условия
                    if (!isNaN(posGd.longitude) && !isNaN(posGd.latitude) && h > 0) {
                        const cartesian = Cesium.Cartesian3.fromRadians(posGd.longitude, posGd.latitude, h);
                        const point = primitives.add({
                            position: cartesian,
                            color: color,
                            pixelSize: 3,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 1
                        });
                        point._satelliteData = { name: sat.name, satrec: sat.satrec, primitive: point };
                        satArray.push(point._satelliteData);
                    }
                }
            });

            // возврат результата
            return { primitives, satArray };
        }

        // объявление функции
        function deactivateLayer(primitives, satArray, renderListener) {
            // проверка условия
            if (renderListener) clearInterval(renderListener);
            // проверка условия
            if (primitives) viewer.scene.primitives.remove(primitives);
            // проверка условия
            if (orbitLine) { viewer.entities.remove(orbitLine); orbitLine = null; }
            infoPanel.style.display = 'none';
        }

        // кнопка "все активные спутники"
        btnAll.addEventListener('click', async () => {
            // проверка условия
            if (isBusyAll) return;
            isBusyAll = true;
            btnAll.style.opacity = '0.5';

            // начало блока перехвата ошибок
            try {
                // проверка условия
                if (!isActiveAll) {
                    isActiveAll = true;
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка всех спутников...') : null;
                    // начало блока перехвата ошибок
                    try {
                        const result = await activateLayer('active', Cesium.Color.LIME.withAlpha(0.8), isBusyAll, btnAll);
                        satPrimitivesAll = result.primitives;
                        satellitesAll = result.satArray;
                        renderListenerAll = setInterval(() => updateSatellitesArray(satellitesAll, satPrimitivesAll), 1000);
                        btnAll.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                    } catch (err) {
                        isActiveAll = false;
                        disableDarkModeIfNoneActive();
                        throw err;
                    } finally {
                        // проверка условия
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    isActiveAll = false;
                    deactivateLayer(satPrimitivesAll, satellitesAll, renderListenerAll);
                    satPrimitivesAll = null; satellitesAll = []; renderListenerAll = null;
                    disableDarkModeIfNoneActive();
                    btnAll.style.backgroundColor = '';
                }
            } catch (err) {
                console.error("Ошибка спутников (все):", err);
                alert("Сбой загрузки: " + err.message);
            } finally {
                isBusyAll = false;
                btnAll.style.opacity = '1.0';
            }
        });

        // кнопка "starlink"
        btnStarlink.addEventListener('click', async () => {
            // проверка условия
            if (isBusyStarlink) return;
            isBusyStarlink = true;
            btnStarlink.style.opacity = '0.5';

            // начало блока перехвата ошибок
            try {
                // проверка условия
                if (!isActiveStarlink) {
                    isActiveStarlink = true;
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка Starlink...') : null;
                    // начало блока перехвата ошибок
                    try {
                        const result = await activateLayer('starlink', Cesium.Color.CYAN.withAlpha(0.9), isBusyStarlink, btnStarlink);
                        satPrimitivesStarlink = result.primitives;
                        satellitesStarlink = result.satArray;
                        renderListenerStarlink = setInterval(() => updateSatellitesArray(satellitesStarlink, satPrimitivesStarlink), 1000);
                        btnStarlink.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                    } catch (err) {
                        isActiveStarlink = false;
                        disableDarkModeIfNoneActive();
                        throw err;
                    } finally {
                        // проверка условия
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    isActiveStarlink = false;
                    deactivateLayer(satPrimitivesStarlink, satellitesStarlink, renderListenerStarlink);
                    satPrimitivesStarlink = null; satellitesStarlink = []; renderListenerStarlink = null;
                    disableDarkModeIfNoneActive();
                    btnStarlink.style.backgroundColor = '';
                }
            } catch (err) {
                console.error("Ошибка спутников (Starlink):", err);
                alert("Сбой загрузки: " + err.message);
            } finally {
                isBusyStarlink = false;
                btnStarlink.style.opacity = '1.0';
            }
        });
    }
    window.initSatelliteVisualization = initSatelliteVisualization;
})();