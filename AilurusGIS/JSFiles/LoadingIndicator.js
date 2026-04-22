(function() {
    let container = document.getElementById('global-loading-indicator');
    if (!container) {
        container = document.createElement('div');
        container.id = 'global-loading-indicator';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        container.style.color = '#fff';
        container.style.padding = '10px 20px';
        container.style.borderRadius = '8px';
        container.style.fontFamily = 'sans-serif';
        container.style.fontSize = '14px';
        container.style.zIndex = '9999';
        container.style.display = 'none';
        container.style.alignItems = 'center';
        container.style.gap = '10px';
        container.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        
        const spinner = document.createElement('div');
        spinner.style.width = '18px';
        spinner.style.height = '18px';
        spinner.style.border = '3px solid rgba(255,255,255,0.3)';
        spinner.style.borderTop = '3px solid #fff';
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'spin-global-loading 1s linear infinite';
        spinner.style.flexShrink = '0'; // Запрещаем сжатие в овал
        spinner.style.boxSizing = 'border-box'; // Учитываем рамки в размерах
        
        const style = document.createElement('style');
        style.textContent = '@keyframes spin-global-loading { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
        
        const textSpan = document.createElement('span');
        textSpan.id = 'global-loading-indicator-text';
        
        container.appendChild(spinner);
        container.appendChild(textSpan);
        document.body.appendChild(container);
    }

    const textSpan = document.getElementById('global-loading-indicator-text');
    let activeTasks = new Map();
    let nextId = 1;

    window.LoadingIndicator = {
        show: function(text) {
            const id = nextId++;
            activeTasks.set(id, text || 'Загрузка...');
            this._update();
            return id;
        },
        hide: function(id) {
            activeTasks.delete(id);
            this._update();
        },
        _update: function() {
            if (activeTasks.size > 0) {
                const tasksArray = Array.from(activeTasks.values());
                textSpan.textContent = tasksArray[tasksArray.length - 1];
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        }
    };
})();