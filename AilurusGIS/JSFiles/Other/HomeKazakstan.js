// координаты центра казахстана
const kazCenter = Cesium.Cartesian3.fromDegrees(66.9237, 48.0196, 25000000); // высота прошлая 1,000,000 м от Земли, сейчас 25,000,000

// устанавливаем казахстан камерой по умолчанию сразу при загрузке страницы (по желанию)
// viewercamerasetview({
// destination: kazcenter
// orientation: {
// heading: cesiummathtoradians(00) // на север
// pitch: cesiummathtoradians(900) // смотрим ровно вниз
// roll: 00
// }
// });

// переопределяем поведение кнопки home
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(e) {
    // отменяем стандартный полет в сша/глобальный вид
    e.cancel = true;
    
    // запускаем свой полет в казахстан
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