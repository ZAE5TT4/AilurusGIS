// Координаты центра Казахстана
const kazCenter = Cesium.Cartesian3.fromDegrees(66.9237, 48.0196, 25000000); // высота прошлая 1,000,000 м от Земли, сейчас 25,000,000

// Устанавливаем Казахстан камерой по умолчанию СРАЗУ при загрузке страницы (по желанию)
// viewer.camera.setView({
//     destination: kazCenter,
//     orientation: {
//         heading: Cesium.Math.toRadians(0.0),    // на север
//         pitch: Cesium.Math.toRadians(-90.0),    // смотрим ровно вниз
//         roll: 0.0
//     }
// });

// Переопределяем поведение кнопки Home
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(e) {
    // Отменяем стандартный полет в США/глобальный вид
    e.cancel = true;
    
    // Запускаем свой полет в Казахстан
    viewer.camera.flyTo({
        destination: kazCenter,
        duration: 2.0, // Длительность анимации полета в секундах
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        }
    });
});