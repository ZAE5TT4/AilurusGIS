/**
 * Кнопка переключения globe-шейдеров.
 * @param {Cesium.Viewer} viewer
 */
function initShaderToggle(viewer) {
    // Получаем или создаем контейнер
    let controlsContainer = document.getElementById('leftBottomControls');
    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'leftBottomControls';
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.bottom = '20px';
        controlsContainer.style.left = '15px';
        controlsContainer.style.zIndex = '1000';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '8px';
        controlsContainer.style.alignItems = 'center';
        viewer.container.appendChild(controlsContainer);
    }

    const shaderButton = document.createElement('button');
    shaderButton.className = 'cesium-button cesium-toolbar-button';
    shaderButton.style.width = '30px';
    shaderButton.style.height = '30px';
    shaderButton.style.padding = '0';
    shaderButton.style.display = 'flex';
    shaderButton.style.justifyContent = 'center';
    shaderButton.style.alignItems = 'center';
    shaderButton.title = 'Отключить шейдеры';
    shaderButton.style.backgroundColor = 'rgba(38, 84, 121, 1)';

    const shaderIcon = document.createElement('img');
    shaderIcon.src = 'Sprites/Icons/Shaders.png';
    shaderIcon.style.width = '20px';
    shaderIcon.style.height = '20px';
    shaderButton.appendChild(shaderIcon);

    let shadersEnabled = true;
    shaderButton.addEventListener('click', function () {
        shadersEnabled = !shadersEnabled;

        const stages = window.__globeShaderStages || {};
        
        // В этот массив добавлен stages.twinklingStars
        [stages.outerGlow, stages.outline, stages.shadow, stages.twinklingStars].forEach((stage) => {
            if (stage) {
                stage.enabled = shadersEnabled;
            }
        });

        shaderButton.title = shadersEnabled ? 'Отключить шейдеры' : 'Включить шейдеры';
        shaderButton.style.backgroundColor = shadersEnabled ? 'rgba(38, 84, 121, 1)' : '';
    });
    
    controlsContainer.appendChild(shaderButton);
}