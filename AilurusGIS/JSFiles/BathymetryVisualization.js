(function () {
    /* * * скрипт визуализации батиметрии (рельефа морского дна) с панелью настроек * исправления: * фикс разрывов и изгибов геометрии (tearing) при отключении за счет принудительного сброса кэша тайлов * фикс краша webgl "bindtexture: deleted object" за счет отложенного удаления шейдеров * @param {cesiumviewer} viewer */
    // объявление функции
    function initBathymetryVisualization(viewer) {
        // 1 создание контейнера и кнопки
        let container = document.getElementById('bathymetryUiContainer');
        // проверка условия
        if (!container) {
            container = document.createElement('div');
            container.id = 'bathymetryUiContainer';
            container.style.position = 'absolute';
            container.style.top = '135px'; 
            container.style.left = '15px';
            container.style.zIndex = '1000';
            container.style.display = 'flex';
            viewer.container.appendChild(container);
            
            const syncStyles = document.createElement('style');
            syncStyles.innerHTML = `
                #bathymetryUiContainer {
                    left: var(--panel-offset, 15px) !important;
                    transition: left 0.3s ease-in-out !important;
                }
                
                /* адаптация панели настроек батиметрии под мобильные устройства */
                @media (max-width: 768px) {
                    #bathymetrySettingsPanel {
                        width: 230px !important;
                        padding: 10px !important;
                    }
                    #bathymetrySettingsPanel .bathy-title {
                        font-size: 13px !important;
                    }
                    #bathymetrySettingsPanel .bathy-label {
                        font-size: 12px !important;
                    }
                    #bathyOptionsContainer {
                        gap: 8px !important;
                    }
                }
                
                @media (max-width: 480px) {
                    #bathymetrySettingsPanel {
                        width: 200px !important;
                        padding: 8px !important;
                    }
                    #bathymetrySettingsPanel .bathy-title {
                        font-size: 12px !important;
                    }
                    #bathymetrySettingsPanel .bathy-label {
                        font-size: 11px !important;
                    }
                    #bathyOptionsContainer {
                        gap: 6px !important;
                    }
                    #bathyExaggeration {
                        width: 60px !important;
                    }
                }
            `;
            document.head.appendChild(syncStyles);
        }

        const btnBathy = document.createElement('button');
        btnBathy.className = 'cesium-button cesium-toolbar-button';
        btnBathy.style.width = '30px';
        btnBathy.style.height = '30px';
        btnBathy.style.padding = '0';
        btnBathy.style.display = 'flex';
        btnBathy.style.justifyContent = 'center';
        btnBathy.style.alignItems = 'center';
        btnBathy.title = 'Батиметрия (Рельеф морского дна)';

        const iconBathy = document.createElement('img');
        iconBathy.src = 'Sprites/Icons/CesiumGlobve.png';
        iconBathy.style.width = '20px';
        iconBathy.style.height = '20px';
        btnBathy.appendChild(iconBathy);
        container.appendChild(btnBathy);

        // 2 создание панели настроек
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'bathymetrySettingsPanel'; // Добавили ID для CSS-стилей
        settingsPanel.style.position = 'absolute';
        settingsPanel.style.top = '15px'; 
        settingsPanel.style.left = 'calc(var(--panel-offset, 15px) + 100px)'; 
        settingsPanel.style.backgroundColor = 'rgba(38, 40, 42, 0.95)';
        settingsPanel.style.color = '#fff';
        settingsPanel.style.padding = '15px';
        settingsPanel.style.borderRadius = '6px';
        settingsPanel.style.fontFamily = 'sans-serif';
        settingsPanel.style.width = '280px';
        settingsPanel.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.5)';
        settingsPanel.style.border = '1px solid #444';
        settingsPanel.style.display = 'none'; 
        settingsPanel.style.flexDirection = 'column';
        settingsPanel.style.gap = '12px';
        settingsPanel.style.zIndex = '1000';
        settingsPanel.style.transition = 'left 0.3s ease-in-out';
        
        viewer.container.appendChild(settingsPanel);
        if (window.AilurusPanelManager) window.AilurusPanelManager.register(settingsPanel, { order: 10 });

        // добавили классы bathytitle и bathylabel для адаптивного изменения размеров шрифта
        settingsPanel.innerHTML = `
            <div class="bathy-title" style="font-weight: bold; font-size: 14px; margin-bottom: 5px;">Высота / Глубина</div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="bathy-label" style="font-size: 11px;">-10000m</span>
                <div id="bathyRampContainer" style="flex-grow: 1; height: 15px; border-radius: 3px; overflow: hidden; border: 1px solid #555;"></div>
                <span class="bathy-label" style="font-size: 11px;">2000m</span>
            </div>
            
            <div class="bathy-title" style="cursor: pointer; font-weight: bold; font-size: 14px; margin-top: 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;" id="bathyToggleOptions">
                Настройки (Options)
                <span id="bathyToggleIcon">▼</span>
            </div>
            
            <div id="bathyOptionsContainer" style="display: none; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label for="bathyExaggeration" class="bathy-label" style="cursor: pointer; font-size: 13px;">Усиление рельефа:</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="range" id="bathyExaggeration" min="1" max="5" step="0.1" value="1" style="width: 80px;">
                        <span id="bathyExaggerationVal" class="bathy-label" style="display: inline-block; width: 25px; text-align: right; font-size: 13px;">1</span>
                    </div>
                </div>

                <label class="bathy-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" id="bathyLightToggle" checked> Освещение рельефа
                </label>
                <label class="bathy-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" id="bathyFogToggle" checked> Атмосфера и туман
                </label>
                <label class="bathy-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" id="bathyColorToggle" checked> Цветовая шкала глубин
                </label>
                <label class="bathy-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" id="bathyContourToggle" checked> Контурные линии
                </label>
                <label class="bathy-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" id="bathyInvertToggle"> Светлые контуры
                </label>
            </div>
        `;

        const toggleOptionsBtn = document.getElementById('bathyToggleOptions');
        const optionsContainer = document.getElementById('bathyOptionsContainer');
        const toggleIcon = document.getElementById('bathyToggleIcon');

        toggleOptionsBtn.addEventListener('click', () => {
            // проверка условия
            if (optionsContainer.style.display === 'none') {
                optionsContainer.style.display = 'flex';
                toggleIcon.textContent = '▲';
            } else {
                optionsContainer.style.display = 'none';
                toggleIcon.textContent = '▼';
            }
        });

        // 3 переменные и константы
        let isActive = false;
        let isBusy = false;
        
        let bathyTerrain = null;
        let originalMaxTilt = null;
        let originalExaggeration = null;
        let originalMaxError = null;
        let originalLighting = null;
        let originalLightObject = null;
        let preRenderListener = null;

        // настройки из панели
        let showContourLines = true;
        let showElevationColorRamp = true;
        let invertContourLines = false;

        const minHeight = -10000.0;
        const maxHeight = 2000.0;
        const countourLineSpacing = 500.0;
        const range = maxHeight - minHeight;
        const d = (height) => (height - minHeight) / range;
        
        const scratchNormal = new Cesium.Cartesian3();

        // 4 функции генерации материалов и цветов
        
        let _colorRampDataUrl = null;
        // объявление функции
        function getColorRamp() {
            // проверка условия
            if (_colorRampDataUrl) return _colorRampDataUrl;
            const ramp = document.createElement("canvas");
            ramp.width = 100;
            ramp.height = 15;
            const ctx = ramp.getContext("2d");
            const grd = ctx.createLinearGradient(0, 0, 100, 0);

            grd.addColorStop(d(maxHeight), "#B79E6C");
            grd.addColorStop(d(100.0), "#FBFFEE");
            grd.addColorStop(d(0.0), "#F9FCCA");
            grd.addColorStop(d(-500.0), "#BDE7AD");
            grd.addColorStop(d(-1000.0), "#81D2A3");
            grd.addColorStop(d(-1500.0), "#5AB7A4");
            grd.addColorStop(d(-2000.0), "#4C9AA0");
            grd.addColorStop(d(-2500.0), "#437D9A");
            grd.addColorStop(d(-4000.0), "#3E6194");
            grd.addColorStop(d(-5000.0), "#424380");
            grd.addColorStop(d(-8000.0), "#392D52");
            grd.addColorStop(d(minHeight), "#291C2F");

            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, ramp.width, ramp.height);
            _colorRampDataUrl = ramp.toDataURL('image/png');
            // возврат результата
            return _colorRampDataUrl;
        }

        const uiRampCanvas = document.createElement("canvas");
        uiRampCanvas.width = 100; uiRampCanvas.height = 15;
        const uiRampCtx = uiRampCanvas.getContext("2d");
        const uiRampGrd = uiRampCtx.createLinearGradient(0, 0, 100, 0);
        uiRampGrd.addColorStop(d(maxHeight), "#B79E6C");
        uiRampGrd.addColorStop(d(0.0), "#F9FCCA");
        uiRampGrd.addColorStop(d(-1000.0), "#81D2A3");
        uiRampGrd.addColorStop(d(-2500.0), "#437D9A");
        uiRampGrd.addColorStop(d(-5000.0), "#424380");
        uiRampGrd.addColorStop(d(minHeight), "#291C2F");
        uiRampCtx.fillStyle = uiRampGrd;
        uiRampCtx.fillRect(0, 0, uiRampCanvas.width, uiRampCanvas.height);
        uiRampCanvas.style.width = '100%';
        uiRampCanvas.style.height = '100%';
        document.getElementById('bathyRampContainer').appendChild(uiRampCanvas);

        // объявление функции
        function getElevationContourMaterial() {
            // возврат результата
            return new Cesium.Material({
                fabric: {
                    type: "ElevationColorContour",
                    materials: {
                        contourMaterial: { type: "ElevationContour" },
                        elevationRampMaterial: { type: "ElevationRamp" },
                    },
                    components: {
                        diffuse: "(1.0 - contourMaterial.alpha) * elevationRampMaterial.diffuse + contourMaterial.alpha * contourMaterial.diffuse",
                        alpha: "max(contourMaterial.alpha, elevationRampMaterial.alpha)",
                    },
                },
                translucent: false,
            });
        }

        // объявление функции
        function updateGlobeMaterial() {
            const currentMode = (showContourLines ? "CONTOUR" : "") + (showElevationColorRamp ? "COLOR" : "");
            const globe = viewer.scene.globe;

            // проверка условия
            if (!globe.material || globe.material._bathyMode !== currentMode) {
                let material;
                // проверка условия
                if (showContourLines && showElevationColorRamp) {
                    material = getElevationContourMaterial();
                    material.materials.elevationRampMaterial.uniforms.image = getColorRamp();
                } else if (showContourLines) {
                    material = Cesium.Material.fromType("ElevationContour");
                } else if (showElevationColorRamp) {
                    material = Cesium.Material.fromType("ElevationRamp");
                    material.uniforms.image = getColorRamp();
                } else {
                    material = undefined;
                }

                // проверка условия
                if (material) {
                    material._bathyMode = currentMode;
                }
                globe.material = material;
            }

            const material = globe.material;
            // проверка условия
            if (!material) return;

            // проверка условия
            if (showContourLines && showElevationColorRamp) {
                let shadingUniforms = material.materials.elevationRampMaterial.uniforms;
                shadingUniforms.minimumHeight = minHeight * viewer.scene.verticalExaggeration;
                shadingUniforms.maximumHeight = maxHeight * viewer.scene.verticalExaggeration;
                
                shadingUniforms = material.materials.contourMaterial.uniforms;
                shadingUniforms.width = 1.0;
                shadingUniforms.spacing = countourLineSpacing * viewer.scene.verticalExaggeration;
                shadingUniforms.color = invertContourLines ? Cesium.Color.WHITE.withAlpha(0.5) : Cesium.Color.BLACK.withAlpha(0.5);
            } else if (showContourLines) {
                const shadingUniforms = material.uniforms;
                shadingUniforms.width = 1.0;
                shadingUniforms.spacing = countourLineSpacing * viewer.scene.verticalExaggeration;
                shadingUniforms.color = invertContourLines ? Cesium.Color.WHITE : Cesium.Color.BLACK;
            } else if (showElevationColorRamp) {
                const shadingUniforms = material.uniforms;
                shadingUniforms.minimumHeight = minHeight * viewer.scene.verticalExaggeration;
                shadingUniforms.maximumHeight = maxHeight * viewer.scene.verticalExaggeration;
            }
        }

        // объявление функции
        function updateGlobeMaterialUniforms(zoomMagnitude) {
            const material = viewer.scene.globe.material;
            // проверка условия
            if (!Cesium.defined(material)) return;

            const spacing = 5.0 * Math.pow(10, Math.floor(4 * zoomMagnitude));
            // проверка условия
            if (showContourLines) {
                const uniforms = showElevationColorRamp ? material.materials.contourMaterial.uniforms : material.uniforms;
                uniforms.spacing = spacing * viewer.scene.verticalExaggeration;
            }

            // проверка условия
            if (showElevationColorRamp) {
                const uniforms = showContourLines ? material.materials.elevationRampMaterial.uniforms : material.uniforms;
                uniforms.spacing = spacing * viewer.scene.verticalExaggeration;
            }
        }

        // объявление функции
        function onPreRender(scene, time) {
            // проверка условия
            if (!isActive) return;
            const camera = scene.camera;
            const globe = scene.globe;
            const cameraMaxHeight = globe.ellipsoid.maximumRadius * 2;
            
            // проверка условия
            if (globe.enableLighting && scene.light instanceof Cesium.DirectionalLight) {
                const surfaceNormal = globe.ellipsoid.geodeticSurfaceNormal(camera.positionWC, scratchNormal);
                const negativeNormal = Cesium.Cartesian3.negate(surfaceNormal, surfaceNormal);
                
                scene.light.direction = Cesium.Cartesian3.normalize(
                    Cesium.Cartesian3.add(negativeNormal, camera.rightWC, surfaceNormal),
                    scene.light.direction
                );
            }

            const zoomMagnitude = Cesium.Cartesian3.magnitude(camera.positionWC) / cameraMaxHeight;
            updateGlobeMaterialUniforms(zoomMagnitude);
        }

        // 5 логика отключения/включения постпроцессов
        function toggleCustomShaders(enableBathy) {
            // проверка условия
            if (enableBathy) {
                // проверка условия
                if (viewer.scene.postProcessStages.bloom) {
                    viewer.scene.postProcessStages.bloom._wasEnabledBeforeBathy = viewer.scene.postProcessStages.bloom.enabled;
                    viewer.scene.postProcessStages.bloom.enabled = false;
                }

                // начало цикла
                for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
                    const stage = viewer.scene.postProcessStages.get(i);
                    // проверка условия
                    if (stage === viewer.scene.postProcessStages.fxaa) continue; 
                    
                    // проверка условия
                    if (stage.enabled) {
                        stage._wasEnabledBeforeBathy = true;
                        stage.enabled = false;
                    }
                }
            } else {
                // проверка условия
                if (viewer.scene.postProcessStages.bloom && viewer.scene.postProcessStages.bloom._wasEnabledBeforeBathy !== undefined) {
                    viewer.scene.postProcessStages.bloom.enabled = viewer.scene.postProcessStages.bloom._wasEnabledBeforeBathy;
                    delete viewer.scene.postProcessStages.bloom._wasEnabledBeforeBathy;
                }

                // начало цикла
                for (let i = 0; i < viewer.scene.postProcessStages.length; i++) {
                    const stage = viewer.scene.postProcessStages.get(i);
                    // проверка условия
                    if (stage._wasEnabledBeforeBathy) {
                        stage.enabled = true;
                        delete stage._wasEnabledBeforeBathy;
                    }
                }
            }
        }

        // 6 привязка событий панели
        document.getElementById('bathyLightToggle').addEventListener('change', (e) => {
            viewer.scene.globe.enableLighting = e.target.checked;
        });

        document.getElementById('bathyFogToggle').addEventListener('change', (e) => {
            viewer.scene.fog.enabled = e.target.checked;
            viewer.scene.globe.showGroundAtmosphere = e.target.checked;
        });

        document.getElementById('bathyColorToggle').addEventListener('change', (e) => {
            showElevationColorRamp = e.target.checked;
            updateGlobeMaterial();
        });

        document.getElementById('bathyContourToggle').addEventListener('change', (e) => {
            showContourLines = e.target.checked;
            updateGlobeMaterial();
        });

        document.getElementById('bathyInvertToggle').addEventListener('change', (e) => {
            invertContourLines = e.target.checked;
            updateGlobeMaterial(); 
        });

        const exagInput = document.getElementById('bathyExaggeration');
        
        exagInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('bathyExaggerationVal').textContent = val;
            viewer.scene.verticalExaggeration = val;
            updateGlobeMaterial();
            viewer.scene.requestRender(); 
        });

        // 7 основная логика кнопки
        btnBathy.addEventListener('click', async () => {
            // проверка условия
            if (isBusy) return;
            isBusy = true;
            btnBathy.style.pointerEvents = 'none';
            btnBathy.style.opacity = '0.5';

            // начало блока перехвата ошибок
            try {
                isActive = !isActive;
                
                // проверка условия
                if (isActive) {
                    // включение
                    const loadId = window.LoadingIndicator ? window.LoadingIndicator.show('Загрузка батиметрии дна...') : null;
                    // начало блока перехвата ошибок
                    try {
                        // загружаем батиметрию каждый раз заново чтобы избежать использования удаленных из памяти объектов
                        bathyTerrain = await Cesium.createWorldBathymetryAsync({ requestVertexNormals: true });
                        
                        // запоминаем текущие настройки камеры и геометрии
                        originalMaxTilt = viewer.scene.screenSpaceCameraController.maximumTiltAngle;
                        originalExaggeration = viewer.scene.verticalExaggeration;
                        originalMaxError = viewer.scene.globe.maximumScreenSpaceError;
                        originalLighting = viewer.scene.globe.enableLighting;
                        originalLightObject = viewer.scene.light;
                        
                        viewer.terrainProvider = bathyTerrain;
                        viewer.scene.screenSpaceCameraController.maximumTiltAngle = Math.PI / 2.0;
                        viewer.scene.globe.maximumScreenSpaceError = 1.0; 

                        viewer.scene.globe.enableLighting = document.getElementById('bathyLightToggle').checked;
                        viewer.scene.light = new Cesium.DirectionalLight({
                            direction: new Cesium.Cartesian3(1, 0, 0),
                        });

                        toggleCustomShaders(true);
                        
                        viewer.scene.verticalExaggeration = parseFloat(document.getElementById('bathyExaggeration').value);
                        
                        updateGlobeMaterial();
                        preRenderListener = viewer.scene.preRender.addEventListener(onPreRender);
                        
                        btnBathy.style.backgroundColor = 'rgba(38, 84, 121, 1)'; 
                        btnBathy.title = 'Батиметрия (Вкл)';
                        
                        settingsPanel.style.display = 'flex'; 
                        optionsContainer.style.display = 'none';
                        toggleIcon.textContent = '▼';

                    } finally {
                        // проверка условия
                        if (loadId !== null && window.LoadingIndicator) window.LoadingIndicator.hide(loadId);
                    }
                } else {
                    // выключение
                    settingsPanel.style.display = 'none';
                    
                    // 1 сбрасываем параметры искажения до смены рельефа чтобы предотвратить "разрывы" (tearing)
                    viewer.scene.verticalExaggeration = originalExaggeration !== null ? originalExaggeration : 1.0;
                    viewer.scene.screenSpaceCameraController.maximumTiltAngle = originalMaxTilt !== null ? originalMaxTilt : Math.PI;
                    viewer.scene.globe.maximumScreenSpaceError = originalMaxError !== null ? originalMaxError : 2.0;

                    // 2 безопасное восстановление рельефа (полная очистка кэша тайлов через baselayerpicker)
                    // это гарантирует что старые искаженные тайлы будут удалены и геометрия полностью перестроится
                    if (viewer.baseLayerPicker && viewer.baseLayerPicker.viewModel) {
                        const vm = viewer.baseLayerPicker.viewModel;
                        const isFunc = typeof vm.selectedTerrain === 'function';
                        const selected = isFunc ? vm.selectedTerrain() : vm.selectedTerrain;
                        
                        // временно ставим undefined чтобы сбросить текущую геометрию
                        if (isFunc) vm.selectedTerrain(undefined);
                        else vm.selectedTerrain = undefined;

                        // возвращаем исходный рельеф пользователя с небольшой задержкой
                        setTimeout(() => {
                            // проверка условия
                            if (isFunc) vm.selectedTerrain(selected);
                            else vm.selectedTerrain = selected;
                        }, 50);
                    } else {
                        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
                    }
                    
                    // 3 возвращаем свет и шейдеры
                    viewer.scene.globe.enableLighting = originalLighting !== null ? originalLighting : false;
                    viewer.scene.light = originalLightObject || new Cesium.SunLight();
                    toggleCustomShaders(false);
                    
                    // проверка условия
                    if (preRenderListener) {
                        preRenderListener(); 
                        preRenderListener = null;
                    }
                    
                    // 4 безопасное удаление шейдерного материала с задержкой
                    // (предотвращает краш webgl: "bindtexture attempt to use a deleted object")
                    // задержка дает движку время дорендерить и выгрузить старые куски рельефа перед удалением их текстур
                    setTimeout(() => {
                        // проверка условия
                        if (!isActive) {
                            viewer.scene.globe.material = undefined;
                            bathyTerrain = null; // Полностью сбрасываем батиметрию из памяти
                        }
                    }, 400); 
                    
                    btnBathy.style.backgroundColor = '';
                    btnBathy.title = 'Батиметрия (Выкл)';
                }
            } catch (error) {
                console.error('Ошибка батиметрии:', error);
                isActive = false;
                btnBathy.style.backgroundColor = '';
                settingsPanel.style.display = 'none';
                
                alert('Не удалось загрузить данные батиметрии.\nКод ошибки: ' + error.message);
            } finally {
                isBusy = false;
                btnBathy.style.pointerEvents = 'auto';
                btnBathy.style.opacity = '1.0';
            }
        });
    }
    
    window.initBathymetryVisualization = initBathymetryVisualization;
})();

/* * this code for bathymetry visualization including the dynamic * elevation materials contour lines custom lighting adaptation * and ui logic was adapted from the official cesium sandcastle examples */