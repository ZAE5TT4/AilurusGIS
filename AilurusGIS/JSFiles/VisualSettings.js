function applyVisualSettings(viewer) {
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

    const baseLayer = viewer.imageryLayers.get(0);
    if (baseLayer) {
        baseLayer.saturation = 1.05;
        baseLayer.brightness = 1.0;
        baseLayer.gamma = 1.0;
    }
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#030A18');

    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.shadows = true;
    viewer.clock.shouldAnimate = true;

    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.hueShift = 0.03;
    viewer.scene.skyAtmosphere.saturationShift = 0.1;
    viewer.scene.skyAtmosphere.brightnessShift = -0.2;

    viewer.scene.globe.atmosphereHueShift = 0.03;
    viewer.scene.globe.atmosphereSaturationShift = 0.2;
    viewer.scene.globe.atmosphereBrightnessShift = 0.1;

    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00055;
    viewer.scene.fog.minimumBrightness = 0.02;

    viewer.scene.highDynamicRange = false;

    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.sunBloom = true;
    viewer.scene.moon = new Cesium.Moon();

    viewer.scene.postProcessStages.bloom.enabled = true;
    viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false;
    viewer.scene.postProcessStages.bloom.uniforms.stepSize = 1.0;
    viewer.scene.postProcessStages.bloom.uniforms.delta = 1.0;
    viewer.scene.postProcessStages.bloom.uniforms.sigma = 2.0;

    viewer.scene.preUpdate.addEventListener(function() {
        const camera = viewer.camera;
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);
        const height = cartographic ? cartographic.height : 0;

        const spaceHeight = 14000000.0;
        const surfaceHeight = 100000.0;

        const maxContrast = 1.04;
        const maxBrightness = -1.0;

        const minContrast = 1.0;
        const minBrightness = -3.0;

        if (height >= spaceHeight) {
            viewer.scene.postProcessStages.bloom.enabled = true;
            viewer.scene.postProcessStages.bloom.uniforms.contrast = maxContrast;
            viewer.scene.postProcessStages.bloom.uniforms.brightness = maxBrightness;

        } else if (height <= surfaceHeight) {
            viewer.scene.postProcessStages.bloom.enabled = false;

        } else {
            viewer.scene.postProcessStages.bloom.enabled = true;

            let t = (height - surfaceHeight) / (spaceHeight - surfaceHeight);
            let smoothT = t * t * (3.0 - 2.0 * t);

            viewer.scene.postProcessStages.bloom.uniforms.contrast = minContrast + (maxContrast - minContrast) * smoothT;
            viewer.scene.postProcessStages.bloom.uniforms.brightness = minBrightness + (maxBrightness - minBrightness) * smoothT;
        }
    });

    viewer.scene.postProcessStages.fxaa.enabled = true;
}
