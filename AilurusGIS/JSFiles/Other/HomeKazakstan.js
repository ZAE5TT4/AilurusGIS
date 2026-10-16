const kazCenter = Cesium.Cartesian3.fromDegrees(66.9237, 48.0196, 25000000);


viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(e) {
    e.cancel = true;

    viewer.camera.flyTo({
        destination: kazCenter,
        duration: 2.0,
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        }
    });
});
