/**
 * Эффект математического ВНУТРЕННЕГО свечения глобуса (Два слоя)
 * 1 Слой: Основной синеватый градиент со сплошным краем.
 * 2 Слой: Тонкое, очень "мыльное" (размытое) белое свечение поверх.
 * Динамика зума: начинает увеличиваться с гораздо большего расстояния.
 * @param {Cesium.Viewer} viewer 
 */
function applyGlobeOutline(viewer) {
    const outlineShader = `
        uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        
        // Параметры основного синего свечения
        uniform float glowThickness;    
        uniform float glowSolidRatio;   
        uniform float glowIntensity;    
        uniform float glowFalloff;      
        uniform vec3 glowColor;         
        
        // Параметры дополнительной тонкой линии (бывшее белое свечение)
        uniform float lineThickness;
        uniform float lineIntensity;
        uniform vec3 lineColor;         // НОВЫЙ ПАРАМЕТР: Цвет тонкой линии

        in vec2 v_textureCoordinates;

        void main(void) {
            vec4 color = texture(colorTexture, v_textureCoordinates);
            
            float depth = czm_readDepth(depthTexture, v_textureCoordinates);
            if (depth < 0.00001) {
                out_FragColor = color;
                return;
            }

            vec4 clipPos = vec4(v_textureCoordinates * 2.0 - 1.0, 1.0, 1.0);
            vec4 eyePos = czm_inverseProjection * clipPos;
            vec3 rayDir = normalize(eyePos.xyz / eyePos.w);
            
            vec3 earthCenterEC = (czm_view * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vec3 oc = -earthCenterEC;
            
            float b = dot(rayDir, oc);
            float c = dot(oc, oc);
            float d_sq = c - b * b;
            
            if (d_sq < 0.0) {
                out_FragColor = color;
                return;
            }
            
            float d = sqrt(d_sq);
            float rEarth = 6378137.0;
            
            // Если луч пересекает планету
            if (b < 0.0 && d <= rEarth) {
                
                // --- 1. ВЫЧИСЛЯЕМ ОСНОВНОЕ СВЕЧЕНИЕ ---
                float rInner = rEarth * (1.0 - glowThickness); 
                float rSolid = rEarth * (1.0 - glowThickness * glowSolidRatio);
                float bIntens = 0.0;
                
                if (d >= rInner) {
                    if (d >= rSolid) {
                        bIntens = 1.0;
                    } else {
                        bIntens = smoothstep(rInner, rSolid, d);
                        bIntens = pow(bIntens, glowFalloff);
                    }
                }
                
                // --- 2. ВЫЧИСЛЯЕМ ВТОРУЮ ЛИНИЮ (ПРОСТОЙ ГРАДИЕНТ) ---
                float rLine = rEarth * (1.0 - lineThickness);
                float lIntens = 0.0;
                
                if (d >= rLine) {
                    lIntens = smoothstep(rLine, rEarth, d);
                    // Высокая степень (8.0) прижимает градиент к краю, делая его острой линией
                    lIntens = pow(lIntens, 3.0); 
                }
                
                // --- 3. НАКЛАДЫВАЕМ ЦВЕТА ---
                // Сначала матовый синеватый слой
                if (bIntens > 0.0) {
                    float finalAlphaBlue = clamp(bIntens * glowIntensity, 0.0, 1.0);
                    color.rgb = mix(color.rgb, glowColor, finalAlphaBlue);
                }
                
                // Поверх добавляем вторую линию тоже через МАТОВОЕ наложение (mix), а НЕ свечение
                if (lIntens > 0.0) {
                    float finalAlphaLine = clamp(lIntens * lineIntensity, 0.0, 1.0);
                    color.rgb = mix(color.rgb, lineColor, finalAlphaLine);
                }
            }
            
            out_FragColor = color;
        }
    `;

    // Текущие переменные
    let currentThickness = 0.025;
    let currentSolidRatio = 0.15;
    let currentIntensity = 0.60;
    let currentFalloff = 1.2;
    
    // Переменные для тонкой линии
    let currentLineThickness = 0.015;
    let currentLineIntensity = 0.80;

    const outlineStage = viewer.scene.postProcessStages.add(
        new Cesium.PostProcessStage({
            fragmentShader: outlineShader,
            uniforms: {
                glowThickness: function() { return currentThickness; }, 
                glowSolidRatio: function() { return currentSolidRatio; }, 
                glowIntensity: function() { return currentIntensity; },
                glowFalloff: function() { return currentFalloff; }, 
                glowColor: new Cesium.Cartesian3(0.41, 0.57, 0.84),
                
                // === НАСТРОЙКИ ТОНКОЙ ЛИНИИ (ЗДЕСЬ МЕНЯТЬ ЦВЕТ!) ===
                lineThickness: function() { return currentLineThickness; },
                lineIntensity: function() { return currentLineIntensity; },
                
                // ЦВЕТ ТОНКОЙ ЛИНИИ: (Красный, Зеленый, Синий) от 0.0 до 1.0
                // Например: (1.0, 1.0, 1.0) = чисто белый
                // Например: (0.9, 0.9, 1.0) = белый с легким голубым отливом
                lineColor: new Cesium.Cartesian3(0.85, 0.85, 0.95)
                // ===================================================
            }
        })
    );
    window.__globeShaderStages = window.__globeShaderStages || {};
    window.__globeShaderStages.outline = outlineStage;

    // Логика плавного изменения
    viewer.scene.preUpdate.addEventListener(function() {
        const camera = viewer.camera;
        
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);
        const height = cartographic ? cartographic.height : 0;
        
        // --- 1. ВЫСОТНЫЕ ПОРОГИ (Изменены для более раннего старта) ---
        const spaceHeight = 18000000.0;   // 18 000 км (Начинаем увеличивать гораздо раньше!)
        const highOrbitHeight = 7000000.0;// 7 000 км (Завершение резкого скачка)
        const approachHeight = 4000000.0; // 4 000 км (Начало затухания)
        const surfaceHeight = 1500000.0   // 1 500 км (Полностью пропадает)
        
        // --- 2. КОСМОС (Вдали) ---
        const farThickness = 0.042; 
        const farSolidRatio = 0.20; 
        const farIntensity = 0.60;  
        const farFalloff = 1.2;     
        
        // === МАЛЕНЬКАЯ ЛИНИЯ: В КОСМОСЕ (ОЧЕНЬ ДАЛЕКО) ===
        // Меняйте эти цифры, если маленькая линия плохо видна издалека
        const farLineThick = 0.015; // <-- ТОЛЩИНА МАЛЕНЬКОЙ ЛИНИИ (0.015 = 1.5%)
        const farLineInt = 0.80;    // <-- ЯРКОСТЬ МАЛЕНЬКОЙ ЛИНИИ (0.80 = 80% видимости)
        // =================================================
        
        // --- 3. ВЕРХНЯЯ ОРБИТА (Быстрый рост размера) ---
        const highThickness = 0.10; 
        const highSolidRatio = 0.10;
        const highIntensity = 0.45;
        const highFalloff = 0.6;
        
        // === МАЛЕНЬКАЯ ЛИНИЯ: НАЧАЛО ПРИБЛИЖЕНИЯ ===
        const highLineThick = 0.050; // <-- ТОЛЩИНА МАЛЕНЬКОЙ ЛИНИИ (Остается 1.5%)
        const highLineInt = 0.60;    // <-- ЯРКОСТЬ МАЛЕНЬКОЙ ЛИНИИ (Чуть тускнеет до 60%)
        // ===========================================
        
        // --- 4. НИЖНЯЯ ОРБИТА (Медленный рост) ---
        const midThickness = 0.15;  
        const midSolidRatio = 0.05; 
        const midIntensity = 0.35;  
        const midFalloff = 0.4;     
        
        // === МАЛЕНЬКАЯ ЛИНИЯ: СРЕДНЯЯ ОРБИТА ===
        // Здесь она достигает своего максимума
        const midLineThick = 0.02;  // <-- ТОЛЩИНА МАЛЕНЬКОЙ ЛИНИИ (Выросла до 2%)
        const midLineInt = 0.30;    // <-- ЯРКОСТЬ МАЛЕНЬКОЙ ЛИНИИ (Стала прозрачнее, 40%)
        // =======================================
        
        // --- 5. ПОВЕРХНОСТЬ (Затухание) ---
        const closeThickness = 0.15; 
        const closeSolidRatio = 0.05;
        const closeIntensity = 0.0; 
        const closeFalloff = 0.4;
        
        // === МАЛЕНЬКАЯ ЛИНИЯ: У САМОЙ ЗЕМЛИ (НАД ГОРОДАМИ) ===
        const closeLineThick = 0.02; // <-- ТОЛЩИНА МАЛЕНЬКОЙ ЛИНИИ
        const closeLineInt = 0.0;    // <-- ЯРКОСТЬ МАЛЕНЬКОЙ ЛИНИИ (0.0 = ПОЛНОСТЬЮ ИСЧЕЗЛА!)
        // Если хотите, чтобы она не исчезала у земли, поменяйте 0.0 на 0.2, например.
        // =====================================================
        
        // Математика переходов
        if (height >= spaceHeight) {
            currentThickness = farThickness;
            currentSolidRatio = farSolidRatio;
            currentIntensity = farIntensity;
            currentFalloff = farFalloff;
            currentLineThickness = farLineThick;
            currentLineIntensity = farLineInt;
            
        } else if (height > highOrbitHeight && height < spaceHeight) {
            let t = (height - highOrbitHeight) / (spaceHeight - highOrbitHeight);
            let smoothT = t * t * (3.0 - 2.0 * t);
            
            currentThickness = highThickness * (1.0 - smoothT) + farThickness * smoothT;
            currentSolidRatio = highSolidRatio * (1.0 - smoothT) + farSolidRatio * smoothT;
            currentIntensity = highIntensity * (1.0 - smoothT) + farIntensity * smoothT;
            currentFalloff = highFalloff * (1.0 - smoothT) + farFalloff * smoothT;
            currentLineThickness = highLineThick * (1.0 - smoothT) + farLineThick * smoothT;
            currentLineIntensity = highLineInt * (1.0 - smoothT) + farLineInt * smoothT;
            
        } else if (height > approachHeight && height <= highOrbitHeight) {
            let t = (height - approachHeight) / (highOrbitHeight - approachHeight);
            let smoothT = t * t * (3.0 - 2.0 * t);
            
            currentThickness = midThickness * (1.0 - smoothT) + highThickness * smoothT;
            currentSolidRatio = midSolidRatio * (1.0 - smoothT) + highSolidRatio * smoothT;
            currentIntensity = midIntensity * (1.0 - smoothT) + highIntensity * smoothT;
            currentFalloff = midFalloff * (1.0 - smoothT) + highFalloff * smoothT;
            currentLineThickness = midLineThick * (1.0 - smoothT) + highLineThick * smoothT;
            currentLineIntensity = midLineInt * (1.0 - smoothT) + highLineInt * smoothT;
            
        } else if (height > surfaceHeight && height <= approachHeight) {
            let t = (height - surfaceHeight) / (approachHeight - surfaceHeight);
            let smoothT = t * t * (3.0 - 2.0 * t);
            
            currentThickness = closeThickness * (1.0 - smoothT) + midThickness * smoothT;
            currentSolidRatio = closeSolidRatio * (1.0 - smoothT) + midSolidRatio * smoothT;
            currentIntensity = closeIntensity * (1.0 - smoothT) + midIntensity * smoothT;
            currentFalloff = closeFalloff * (1.0 - smoothT) + midFalloff * smoothT;
            currentLineThickness = closeLineThick * (1.0 - smoothT) + midLineThick * smoothT;
            currentLineIntensity = closeLineInt * (1.0 - smoothT) + midLineInt * smoothT;
            
        } else {
            currentThickness = closeThickness;
            currentSolidRatio = closeSolidRatio;
            currentIntensity = closeIntensity;
            currentFalloff = closeFalloff;
            currentLineThickness = closeLineThick;
            currentLineIntensity = closeLineInt;
        }
    });
}
