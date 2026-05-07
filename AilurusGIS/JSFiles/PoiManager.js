(function () {
    /* * * менеджер закладок (pois) * токен пользователя генерируется один раз и хранится в localstorage * каждый браузер/устройство видит только свои метки * десктоп: правый клик по метке удаление * мобильные: тап по существующей метке удаление (с подтверждением) * экспорт / импорт через диалог */

    // токен пользователя
    function getUserToken() {
        const KEY = 'ailurus_user_token';
        let token = localStorage.getItem(KEY);
        // проверка условия
        if (!token || token.length < 16) {
            const arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            token = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(KEY, token);
        }
        // возврат результата
        return token;
    }

    const USER_TOKEN = getUserToken();

    // объявление функции
    function apiFetch(url, options = {}) {
        options.headers = Object.assign({}, options.headers, {
            'X-User-Token': USER_TOKEN,
            'Content-Type': options.body ? 'application/json' : undefined
        });
        Object.keys(options.headers).forEach(k => {
            // проверка условия
            if (options.headers[k] === undefined) delete options.headers[k];
        });
        // возврат результата
        return fetch(url, options);
    }

    // основная инициализация
    function initPoiManager(viewer) {
        let container = document.getElementById('dbUiContainer');
        // проверка условия
        if (!container) {
            container = document.createElement('div');
            container.id = 'dbUiContainer';
            container.style.position = 'absolute';
            container.style.top = '295px';
            container.style.display = 'flex';
            container.style.gap = '10px';
            container.style.zIndex = '999';
            document.body.appendChild(container);

            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `#dbUiContainer { left: var(--panel-offset, 15px) !important; transition: left 0.3s ease-in-out !important; }`;
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
        btn.title = 'Закладки на карте';
        btn.innerHTML = '<img src="Sprites/Icons/Bookmarks.png" style="width:20px;height:20px;">';
        container.appendChild(btn);

        // панель
        const panel = document.createElement('div');
        panel.id = 'poiPanel'; // Добавлен ID для стилизации в MobileAdapter
        panel.style.position = 'absolute';
        panel.style.top = '15px';
        panel.style.left = 'calc(var(--panel-offset, 15px) + 100px)';
        panel.style.backgroundColor = 'rgba(38, 40, 42, 0.95)';
        panel.style.color = '#fff';
        panel.style.padding = '15px';
        panel.style.borderRadius = '6px';
        panel.style.fontFamily = 'sans-serif';
        panel.style.fontSize = '13px';
        panel.style.width = '260px';
        panel.style.border = '1px solid #444';
        panel.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.5)';
        panel.style.zIndex = '1000';
        panel.style.display = 'none';
        panel.style.flexDirection = 'column';
        panel.style.gap = '10px';
        panel.style.transition = 'left 0.3s ease-in-out';
        viewer.container.appendChild(panel);

        const isMobile = window.AilurusIsMobile ||
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            window.innerWidth <= 768;

        const deleteTip = isMobile
            ? '<b>Тап</b> по метке — удалить её.'
            : '<b>Правый клик</b> по метке — удалить её.';

        panel.innerHTML = `
            <div style="font-weight: bold; font-size: 15px;">Менеджер закладок</div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="poiTextInput" placeholder="Название метки..." style="flex: 1; padding: 5px; background: #333; color: white; border: 1px solid #555; border-radius: 3px;">
                <input type="color" id="poiColorInput" value="#FF5500" title="Цвет" style="width: 30px; height: 30px; border: none; cursor: pointer; background: transparent; padding: 0;">
            </div>
            <div style="font-size: 11px; color: #aaa; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                <b>Инструкция:</b><br>
                1. Введите текст и выберите цвет.<br>
                2. <b>${isMobile ? 'Тап' : 'Левый клик'}</b> по карте — поставить метку.<br>
                3. ${deleteTip}
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="poiExportBtn" style="flex: 1; padding: 6px; cursor: pointer; background: #265479; color: white; border: 1px solid #444; border-radius: 3px;">Экспорт</button>
                <button id="poiImportBtn" style="flex: 1; padding: 6px; cursor: pointer; background: #265479; color: white; border: 1px solid #444; border-radius: 3px;">Импорт</button>
            </div>
        `;

        let isActive = false;
        let poiDataSource = new Cesium.CustomDataSource('UserPOIs');
        viewer.dataSources.add(poiDataSource);
        let handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // объявление функции
        function createPoiCanvas(colorHex) {
            const canvas = document.createElement('canvas');
            canvas.width = 40;
            canvas.height = 40;
            const ctx = canvas.getContext('2d');
            const cx = 20, cy = 20;
            ctx.beginPath(); ctx.arc(cx, cy, 13.5, 0, 2 * Math.PI); ctx.fillStyle = '#FFFFFF'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 10.5, 0, 2 * Math.PI); ctx.fillStyle = '#000000'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = colorHex; ctx.fill();
            // возврат результата
            return canvas;
        }

        // объявление функции
        function createPoiDeleteCanvas(colorHex) {
            const canvas = createPoiCanvas(colorHex);
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#FF2222';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(28, 28); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(28, 12); ctx.lineTo(12, 28); ctx.stroke();
            // возврат результата
            return canvas;
        }

        // объявление функции
        function parsePoiText(rawText) {
            // начало блока перехвата ошибок
            try {
                const obj = JSON.parse(rawText);
                // возврат результата
                return { text: obj.t || rawText, color: obj.c || '#FF5500' };
            } catch (e) {
                // возврат результата
                return { text: rawText, color: '#FF5500' };
            }
        }

        let pendingDeleteId = null;

        // объявление функции
        async function loadPois() {
            poiDataSource.entities.removeAll();
            pendingDeleteId = null;
            // начало блока перехвата ошибок
            try {
                const res = await apiFetch('/api/poi');
                // проверка условия
                if (!res.ok) return;
                const pois = await res.json();
                pois.forEach(p => {
                    const parsed = parsePoiText(p.text);
                    poiDataSource.entities.add({
                        id: 'poi_' + p.id,
                        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
                        billboard: {
                            image: createPoiCanvas(parsed.color),
                            width: 40, height: 40,
                            verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY
                        },
                        label: {
                            text: parsed.text,
                            font: 'bold 16px sans-serif',
                            fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 5, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            showBackground: false, verticalOrigin: Cesium.VerticalOrigin.CENTER,
                            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                            pixelOffset: new Cesium.Cartesian2(24, 0),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            translucencyByDistance: new Cesium.NearFarScalar(8000000, 1.0, 15000000, 0.0)
                        },
                        _poiColor: parsed.color
                    });
                });
            } catch (e) { console.error("Ошибка загрузки POI:", e); }
        }

        // объявление функции
        async function deletePoi(entityStringId) {
            const dbId = entityStringId.replace('poi_', '');
            // начало блока перехвата ошибок
            try {
                const res = await apiFetch('/api/poi/' + dbId, { method: 'DELETE' });
                // проверка условия
                if (res.ok) await loadPois();
            } catch (e) {}
        }

        // объявление функции
        function highlightForDelete(entityStringId) {
            const entity = poiDataSource.entities.getById(entityStringId);
            // проверка условия
            if (!entity) return;
            entity.billboard.image = createPoiDeleteCanvas(entity._poiColor || '#FF5500');
        }

        // объявление функции
        function unhighlightDelete(entityStringId) {
            const entity = poiDataSource.entities.getById(entityStringId);
            // проверка условия
            if (!entity) return;
            entity.billboard.image = createPoiCanvas(entity._poiColor || '#FF5500');
        }

        btn.addEventListener('click', () => {
            isActive = !isActive;
            // проверка условия
            if (isActive) {
                btn.style.backgroundColor = 'rgba(38, 84, 121, 1)';
                panel.style.display = 'flex';
                loadPois();

                // проверка условия
                if (isMobile) {
                    handler.setInputAction(async function (click) {
                        // проверка условия
                        if (window.ailurusTouchMoved) return;
                        const pickedObject = viewer.scene.pick(click.position);
                        const pickedId = (Cesium.defined(pickedObject) && pickedObject.id && typeof pickedObject.id.id === 'string' && pickedObject.id.id.startsWith('poi_')) ? pickedObject.id.id : null;

                        // проверка условия
                        if (pickedId) {
                            // проверка условия
                            if (pendingDeleteId === pickedId) {
                                await deletePoi(pickedId);
                            } else {
                                // проверка условия
                                if (pendingDeleteId) unhighlightDelete(pendingDeleteId);
                                pendingDeleteId = pickedId;
                                highlightForDelete(pickedId);
                            }
                        } else {
                            // проверка условия
                            if (pendingDeleteId) {
                                unhighlightDelete(pendingDeleteId);
                                pendingDeleteId = null;
                            } else {
                                const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
                                // проверка условия
                                if (cartesian) {
                                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                                    const lon = Cesium.Math.toDegrees(cartographic.longitude);
                                    const lat = Cesium.Math.toDegrees(cartographic.latitude);
                                    const rawLabel = document.getElementById('poiTextInput').value || 'Новая метка';
                                    const color = document.getElementById('poiColorInput').value;
                                    const textPayload = JSON.stringify({ t: rawLabel, c: color });
                                    // начало блока перехвата ошибок
                                    try {
                                        const res = await apiFetch('/api/poi', { method: 'POST', body: JSON.stringify({ lat, lon, text: textPayload }) });
                                        // проверка условия
                                        if (res.ok) loadPois();
                                    } catch (e) {}
                                }
                            }
                        }
                    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
                } else {
                    handler.setInputAction(async function (click) {
                        const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
                        // проверка условия
                        if (cartesian) {
                            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                            const lon = Cesium.Math.toDegrees(cartographic.longitude);
                            const lat = Cesium.Math.toDegrees(cartographic.latitude);
                            const rawLabel = document.getElementById('poiTextInput').value || 'Новая метка';
                            const color = document.getElementById('poiColorInput').value;
                            const textPayload = JSON.stringify({ t: rawLabel, c: color });
                            // начало блока перехвата ошибок
                            try {
                                const res = await apiFetch('/api/poi', { method: 'POST', body: JSON.stringify({ lat, lon, text: textPayload }) });
                                // проверка условия
                                if (res.ok) loadPois();
                            } catch (e) {}
                        }
                    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

                    handler.setInputAction(async function (click) {
                        const pickedObject = viewer.scene.pick(click.position);
                        // проверка условия
                        if (Cesium.defined(pickedObject) && pickedObject.id && typeof pickedObject.id.id === 'string' && pickedObject.id.id.startsWith('poi_')) {
                            await deletePoi(pickedObject.id.id);
                        }
                    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
                }
            } else {
                btn.style.backgroundColor = '';
                panel.style.display = 'none';
                pendingDeleteId = null;
                handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
                handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
                poiDataSource.entities.removeAll();
            }
        });

        document.getElementById('poiExportBtn').addEventListener('click', async () => {
            // начало блока перехвата ошибок
            try {
                const res = await apiFetch('/api/poi');
                const pois = await res.json();
                const jsonStr = JSON.stringify(pois, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });

                // проверка условия
                if (window.showSaveFilePicker) {
                    // начало блока перехвата ошибок
                    try {
                        const fileHandle = await window.showSaveFilePicker({ suggestedName: 'my_bookmarks.json', types: [{ description: 'JSON файл', accept: { 'application/json': ['.json'] } }] });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        // возврат результата
                        return;
                    } catch (e) { if (e.name === 'AbortError') return; }
                }

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my_bookmarks.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) { console.error("Ошибка при экспорте: " + e.message); }
        });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        document.getElementById('poiImportBtn').addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            // проверка условия
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                // начало блока перехвата ошибок
                try {
                    const pois = JSON.parse(ev.target.result);
                    // проверка условия
                    if (!Array.isArray(pois)) throw new Error("Неверный формат файла");

                    // начало цикла
                    for (const p of pois) {
                        // проверка условия
                        if (p.lat === undefined || p.lon === undefined) continue;
                        await apiFetch('/api/poi', { method: 'POST', body: JSON.stringify({ lat: p.lat, lon: p.lon, text: p.text || 'Метка' }) });
                    }
                    loadPois();
                } catch (err) {}
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    window.initPoiManager = initPoiManager;
})();