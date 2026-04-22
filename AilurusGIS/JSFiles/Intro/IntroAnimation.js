/**
 * Кинематографичная заставка открытия карты (Только математика полета).
 */

const introConfig = {
    endLon: 66.9237,
    endLat: 48.0196,
    endHeight: 25000000,
    startLon: 66.9237 - 360, // Полный оборот вокруг оси
    startLat: 0.0,
    startHeight: 150000000,  // Далекий космос
    
    // Уменьшили время до 3.8 секунд. 
    // Визуально анимация займет столько же, но "мертвой зоны" в конце больше не будет.
    duration: 3800           
};

/**
 * 1. Устанавливает камеру в точку старта.
 */
function setupIntroCamera(viewer) {
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(introConfig.startLon, introConfig.startLat, introConfig.startHeight),
        orientation: {
            heading: 0.0,
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        }
    });
}

/**
 * 2. Запускает сам полет от стартовой точки к конечной.
 */
function playIntroAnimation(viewer) {
    let startTime = null;

    const animHandler = function(scene, time) {
        if (!startTime) {
            startTime = performance.now();
        }

        const now = performance.now();
        let t = (now - startTime) / introConfig.duration;

        // Если анимация закончена
        if (t >= 1.0) {
            // Устанавливаем ровно в финальную точку один раз
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(introConfig.endLon, introConfig.endLat, introConfig.endHeight),
                orientation: {
                    heading: 0.0,
                    pitch: Cesium.Math.toRadians(-90.0),
                    roll: 0.0
                }
            });
            
            // Отписываемся от обновления кадров и возвращаем мышку
            viewer.scene.preUpdate.removeEventListener(animHandler);
            viewer.scene.screenSpaceCameraController.enableInputs = true; 
            
            return; // Обязательно выходим из функции, чтобы не вызывать нижний setView
        }

        // Quintic Out (резкий старт, очень плавное торможение)
        const easeT = 1.0 - Math.pow(1.0 - t, 5);

        const currentLon = introConfig.startLon + (introConfig.endLon - introConfig.startLon) * easeT;
        const currentLat = introConfig.startLat + (introConfig.endLat - introConfig.startLat) * easeT;
        const currentHeight = introConfig.startHeight + (introConfig.endHeight - introConfig.startHeight) * easeT;

        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(currentLon, currentLat, currentHeight),
            orientation: {
                heading: 0.0,
                pitch: Cesium.Math.toRadians(-90.0),
                roll: 0.0
            }
        });
    };

    viewer.scene.preUpdate.addEventListener(animHandler);
}