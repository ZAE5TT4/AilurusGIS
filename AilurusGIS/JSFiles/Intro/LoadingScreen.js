/* * * экран загрузки карты * показывает индикатор загрузки на черном фоне * убирается только тогда когда движок скачает и отрендерит все тайлы земли для текущего вида * * @param {cesiumviewer} viewer * @param {function} onreadycallback функция которая запустится после окончания загрузки */
// объявление функции
function initLoadingScreen(viewer, onReadyCallback) {
    // 1 создаем контейнер экрана загрузки
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = '#000000'; // Черный фон
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = 'Arial, sans-serif';
    overlay.style.transition = 'opacity 1.2s ease-in-out'; // Плавное затухание
    
    // 2 добавляем текст
    const text = document.createElement('div');
    text.innerText = 'ЗАГРУЗКА ДАННЫХ...';
    text.style.fontSize = '14px';
    text.style.letterSpacing = '6px';
    text.style.marginBottom = '25px';
    text.style.color = '#8899aa'; // Легкий синевато-серый оттенок

    // 3 добавляем стильный cssспиннер
    const spinner = document.createElement('div');
    spinner.style.width = '45px';
    spinner.style.height = '45px';
    spinner.style.border = '3px solid rgba(255, 255, 255, 0.1)';
    spinner.style.borderTop = '3px solid #00aaff'; // Синий акцент в стиле твоего глобуса
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'cesium-spin 1s linear infinite';
    
    // встраиваем стиль для анимации спиннера
    const style = document.createElement('style');
    style.innerHTML = '@keyframes cesium-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);

    // собираем dom
    overlay.appendChild(text);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    // блокируем управление на время загрузки
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    // 4 логика ожидания загрузки
    // чтобы экран не моргал если кэш быстрый добавим минимальное время показа (например 15 сек)
    let minTimeElapsed = false;
    setTimeout(() => { minTimeElapsed = true; }, 1500);

    // проверяем статус загрузки тайлов каждые 100мс
    const checkInterval = setInterval(() => {
        // globetilesloaded true когда для текущего кадра всё скачано
        if (viewer.scene.globe.tilesLoaded && minTimeElapsed) {
            clearInterval(checkInterval);
            
            // начинаем плавно растворять черный экран
            overlay.style.opacity = '0';
            
            // сразу запускаем анимацию полета чтобы планета эффектно вылетала из темноты
            if (onReadyCallback) onReadyCallback();
            
            // через 15 секунды полностью удаляем html элементы из памяти
            setTimeout(() => { 
                overlay.remove(); 
                style.remove();
            }, 1500);
        }
    }, 100);
}