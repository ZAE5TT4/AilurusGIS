/* * * музыкальный плеер * @param {cesiumviewer} viewer */
// объявление функции
function initMusicPlayer(viewer) {
    const audio = new Audio('Music/AilurusGIS.ogg');
    audio.loop = true;
    audio.volume = 0.5;

    let controlsContainer = document.getElementById('leftBottomControls');
    // проверка условия
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

    const musicButton = document.createElement('button');
    musicButton.className = 'cesium-button cesium-toolbar-button';
    musicButton.title = 'Музыка ВКЛ';
    musicButton.style.width = '30px';
    musicButton.style.height = '30px';
    musicButton.style.padding = '0';
    musicButton.style.display = 'flex';
    musicButton.style.justifyContent = 'center';
    musicButton.style.alignItems = 'center';

    const iconMuted = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
    `;

    const iconPlaying = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
    `;

    let isPlaying = false;
    musicButton.innerHTML = iconMuted;
    musicButton.addEventListener('click', function () {
        // проверка условия
        if (isPlaying) {
            audio.pause();
            musicButton.innerHTML = iconMuted;
            musicButton.title = 'Музыка ВКЛ';
            musicButton.style.backgroundColor = '';
        } else {
            audio.play();
            musicButton.innerHTML = iconPlaying;
            musicButton.title = 'Музыка ВЫКЛ';
            musicButton.style.backgroundColor = 'rgba(38, 84, 121, 1)';
        }
        isPlaying = !isPlaying;
    });
    controlsContainer.appendChild(musicButton);
}