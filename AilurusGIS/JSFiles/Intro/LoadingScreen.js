/**
 * Экран загрузки карты.
 * Показывает индикатор загрузки на черном фоне.
 * Убирается только тогда, когда движок скачает и отрендерит все тайлы Земли для текущего вида.
 * * @param {Cesium.Viewer} viewer 
 * @param {Function} onReadyCallback - функция, которая запустится после окончания загрузки
 */
function initLoadingScreen(viewer, onReadyCallback) {
    // 1. Создаем контейнер экрана загрузки
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
    
    // 2. Добавляем текст
    const text = document.createElement('div');
    text.innerText = 'ЗАГРУЗКА ДАННЫХ...';
    text.style.fontSize = '14px';
    text.style.letterSpacing = '6px';
    text.style.marginBottom = '25px';
    text.style.color = '#8899aa'; // Легкий синевато-серый оттенок

    // 3. Добавляем стильный CSS-спиннер
    const spinner = document.createElement('div');
    spinner.style.width = '45px';
    spinner.style.height = '45px';
    spinner.style.border = '3px solid rgba(255, 255, 255, 0.1)';
    spinner.style.borderTop = '3px solid #00aaff'; // Синий акцент в стиле твоего глобуса
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'cesium-spin 1s linear infinite';
    
    // Встраиваем стиль для анимации спиннера
    const style = document.createElement('style');
    style.innerHTML = '@keyframes cesium-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);

    // Собираем DOM
    overlay.appendChild(text);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    // Блокируем управление на время загрузки
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    // 4. Логика ожидания загрузки
    // Чтобы экран не моргал, если кэш быстрый, добавим минимальное время показа (например, 1.5 сек)
    let minTimeElapsed = false;
    setTimeout(() => { minTimeElapsed = true; }, 1500);

    // Проверяем статус загрузки тайлов каждые 100мс
    const checkInterval = setInterval(() => {
        // globe.tilesLoaded = true, когда для текущего кадра всё скачано
        if (viewer.scene.globe.tilesLoaded && minTimeElapsed) {
            clearInterval(checkInterval);
            
            // Начинаем плавно растворять черный экран
            overlay.style.opacity = '0';
            
            // СРАЗУ запускаем анимацию полета, чтобы планета эффектно вылетала из темноты
            if (onReadyCallback) onReadyCallback();
            
            // Через 1.5 секунды полностью удаляем HTML элементы из памяти
            setTimeout(() => { 
                overlay.remove(); 
                style.remove();
            }, 1500);
        }
    }, 100);
}