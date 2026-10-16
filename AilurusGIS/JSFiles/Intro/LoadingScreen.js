function initLoadingScreen(viewer, onReadyCallback) {
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = '#000000';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = 'Arial, sans-serif';
    overlay.style.transition = 'opacity 1.2s ease-in-out';

    const text = document.createElement('div');
    text.innerText = 'ЗАГРУЗКА ДАННЫХ...';
    text.style.fontSize = '14px';
    text.style.letterSpacing = '6px';
    text.style.marginBottom = '25px';
    text.style.color = '#8899aa';

    const spinner = document.createElement('div');
    spinner.style.width = '45px';
    spinner.style.height = '45px';
    spinner.style.border = '3px solid rgba(255, 255, 255, 0.1)';
    spinner.style.borderTop = '3px solid #00aaff';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'cesium-spin 1s linear infinite';

    const style = document.createElement('style');
    style.innerHTML = '@keyframes cesium-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);

    overlay.appendChild(text);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    viewer.scene.screenSpaceCameraController.enableInputs = false;

    let minTimeElapsed = false;
    setTimeout(() => { minTimeElapsed = true; }, 1500);

    const checkInterval = setInterval(() => {
        if (viewer.scene.globe.tilesLoaded && minTimeElapsed) {
            clearInterval(checkInterval);

            overlay.style.opacity = '0';

            if (onReadyCallback) onReadyCallback();

            setTimeout(() => {
                overlay.remove();
                style.remove();
            }, 1500);
        }
    }, 100);
}
