/* * * функция для применения всех визуальных настроек к глобусу cesium * @param {cesiumviewer} viewer инстанс cesium viewer */
// объявление функции
function applyVisualSettings(viewer) {
    // своё небесное пространство
    viewer.scene.skyBox = new Cesium.SkyBox({
        sources: {
            positiveX: 'Sprites/SkySpace/26-04-15-10-18-27_Right.jpg',
            negativeX: 'Sprites/SkySpace/26-04-15-10-18-27_Left.jpg',
            positiveY: 'Sprites/SkySpace/26-04-15-10-18-27_Top.jpg',
            negativeY: 'Sprites/SkySpace/26-04-15-10-18-27_Bottom.jpg',
            positiveZ: 'Sprites/SkySpace/26-04-15-10-18-27_Front.jpg',
            negativeZ: 'Sprites/SkySpace/26-04-15-10-18-27_Back.jpg'
        }
    });

    // 1 настройка цвета поверхности
    const baseLayer = viewer.imageryLayers.get(0);
    // проверка условия
    if (baseLayer) {
        baseLayer.saturation = 1.05; // Легкая насыщенность (чтобы текстура не казалась искусственной)
        baseLayer.brightness = 1.0;  
        baseLayer.gamma = 1.0;       
    }
    // цвет самого глобуса под текстурами (очень темный синий почти черный)
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#030A18');

    // базовые настройки визуала
    viewer.scene.globe.enableLighting = false; // освещение по времени суток
    viewer.scene.globe.showGroundAtmosphere = true; // рассеянный свет
    viewer.shadows = true; // тени от объектов
    viewer.clock.shouldAnimate = true;  // анимация времени

    // 2 настройка атмосферы и ореола (легкий синий без фиолетового более прозрачный)
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.hueShift = 0.03;         // 0.03 - чистый синий (0.08 давало фиолетовый)
    viewer.scene.skyAtmosphere.saturationShift = 0.1;   // Немного убрали насыщенность для естественности
    viewer.scene.skyAtmosphere.brightnessShift = -0.2;  // Минус делает атмосферу визуально более ПРОЗРАЧНОЙ и тонкой

    // 3 настройка дымки над поверхностью (легкая дымка)
    viewer.scene.globe.atmosphereHueShift = 0.03;      // Тот же идеальный синий для дымки над континентами
    viewer.scene.globe.atmosphereSaturationShift = 0.2;
    viewer.scene.globe.atmosphereBrightnessShift = 0.1; 

    // 4 туман (очень плавная и прозрачная дымка вдали)
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00055; // Сделали туман еще тоньше и прозрачнее
    viewer.scene.fog.minimumBrightness = 0.02;  // свечение тумана
    
    // hdr отключен
    viewer.scene.highDynamicRange = false; 

    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.sunBloom = true;
    viewer.scene.moon = new Cesium.Moon();

    // 5 динамические настройки bloom (свечение)
    viewer.scene.postProcessStages.bloom.enabled = true; 
    viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false; 
    viewer.scene.postProcessStages.bloom.uniforms.stepSize = 1.0;
    viewer.scene.postProcessStages.bloom.uniforms.delta = 1.0; 
    viewer.scene.postProcessStages.bloom.uniforms.sigma = 2.0; // Сделали размытие еще аккуратнее

    // добавляем слушатель изменения кадра
    viewer.scene.preUpdate.addEventListener(function() {
        const camera = viewer.camera;
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);
        const height = cartographic ? cartographic.height : 0;

        // экстремально растянутый переход
        const spaceHeight = 14000000.0;   // 14 000 км: начинаем убирать эффект с очень большой высоты
        const surfaceHeight = 100000.0;   // 100 км: полностью выключаем только у самой поверхности

        // очень деликатное свечение в космосе
        const maxContrast = 1.04;    // 1.04 - это микро-усиление яркости. Еле-еле заметное глазу.
        const maxBrightness = -1.0;  // Очень строгий порог. Светится только то, что реально яркое.

        // у земли
        const minContrast = 1.0;     // Нейтральный контраст (нет эффекта)
        const minBrightness = -3.0;  // Блокируем захват любых пикселей на экране

        // проверка условия
        if (height >= spaceHeight) {
            viewer.scene.postProcessStages.bloom.enabled = true;
            viewer.scene.postProcessStages.bloom.uniforms.contrast = maxContrast;
            viewer.scene.postProcessStages.bloom.uniforms.brightness = maxBrightness;
            
        } else if (height <= surfaceHeight) {
            // выключаем только когда уже почти приземлились
            viewer.scene.postProcessStages.bloom.enabled = false;
            
        } else {
            // очень долгий и плавный переход
            viewer.scene.postProcessStages.bloom.enabled = true;
            
            let t = (height - surfaceHeight) / (spaceHeight - surfaceHeight);
            let smoothT = t * t * (3.0 - 2.0 * t); // Мягкая интерполяция

            viewer.scene.postProcessStages.bloom.uniforms.contrast = minContrast + (maxContrast - minContrast) * smoothT;
            viewer.scene.postProcessStages.bloom.uniforms.brightness = minBrightness + (maxBrightness - minBrightness) * smoothT;
        }
    });

    // 6 fxaa для сглаживания краёв (антиалиасинг)
    viewer.scene.postProcessStages.fxaa.enabled = true;
}