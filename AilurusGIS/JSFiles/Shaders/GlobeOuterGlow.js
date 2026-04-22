/**
 * Внешнее синее свечение (halo) вокруг Земли
 * v4: 
 * • обводка теперь почти одинаково толстая близко и далеко
 * • максимально прижата к терминатора со ВСЕХ сторон (сверху и снизу одинаково)
 * @param {Cesium.Viewer} viewer 
 */
function applyGlobeOuterGlow(viewer) {
    
    console.log('🌟 GlobeOuterGlow v4 (толстая близко + прижата со всех сторон) загружен!');

    const outerGlowShader = `
        uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        
        uniform float glowThickness;   
        uniform float glowIntensity;   
        uniform float glowFalloff;     
        uniform vec3  glowColor;

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
            
            float rEarth = 6378137.0;
            float glow = 0.0;
            
            if (d_sq > 0.0) {
                float d = sqrt(d_sq);
                
                if (d > rEarth) {
                    float delta = d - rEarth;
                    float maxDelta = glowThickness * rEarth;
                    
                    if (delta < maxDelta) {
                        float intens = 1.0 - smoothstep(0.0, maxDelta, delta);
                        intens = pow(intens, glowFalloff);
                        
                        float t_closest = -b;
                        vec3 closestPoint = rayDir * t_closest;
                        vec3 normal = normalize(closestPoint - earthCenterEC);
                        
                        vec3 toLight = normalize(vec3(-0.1, 0.1, 0.2));
                        float diffuse = max(dot(normal, toLight), 0.0);
                        
                        // === МАКСИМАЛЬНО ПРИЖАТО К ТЕРМИНАТОРУ СО ВСЕХ СТОРОН ===
                        float litFactor = smoothstep(0.0, 0.135, diffuse);   // очень узкий переход
                        litFactor = pow(litFactor, 3.1);                     // супер-резкий старт
                        
                        glow = intens * litFactor;
                    }
                }
            }
            
            if (glow > 0.0) {
                float finalAlpha = clamp(glow * glowIntensity, 0.0, 1.0);
                color.rgb = mix(color.rgb, glowColor, finalAlpha);
            }
            
            out_FragColor = color;
        }
    `;

    // ==============================================
    // === ГЛОБАЛЬНЫЕ НАСТРОЙКИ                   ===
    // ==============================================
    
    let sizeMultiplier = 0.4;        // ← общий масштаб (1.4 = в 1.4 раза толще везде)

    let nearThickness = 0.080;       // ← ТОЛЩИНА БЛИЗКО
    let farThickness  = 0.050;       // ← ТОЛЩИНА ДАЛЕКО

    let nearIntensity = 0.48;
    let farIntensity  = 0.82;

    let nearFalloff   = 3.9;         // резче близко
    let farFalloff    = 1.45;        // очень мыльное далеко

    const glowColorNear = new Cesium.Cartesian3(0.34, 0.58, 1.00);
    const glowColorFar  = new Cesium.Cartesian3(0.46, 0.78, 1.00);

    // ==============================================

    let currentThickness = farThickness;
    let currentIntensity = farIntensity;
    let currentFalloff   = farFalloff;
    let currentColor     = glowColorFar;

    const glowStage = viewer.scene.postProcessStages.add(
        new Cesium.PostProcessStage({
            fragmentShader: outerGlowShader,
            uniforms: {
                glowThickness: function() { return currentThickness * sizeMultiplier; },
                glowIntensity: function() { return currentIntensity; },
                glowFalloff:   function() { return currentFalloff; },
                glowColor:     function() { return currentColor; }
            }
        })
    );
    window.__globeShaderStages = window.__globeShaderStages || {};
    window.__globeShaderStages.outerGlow = glowStage;

    viewer.scene.preUpdate.addEventListener(function() {
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(viewer.camera.position);
        const height = cartographic ? cartographic.height : 0;

        const farHeight  = 18000000.0;
        const nearHeight = 2500000.0;

        let t = (height - nearHeight) / (farHeight - nearHeight);
        t = Math.max(0.0, Math.min(1.0, t));
        let smoothT = t * t * (3.0 - 2.0 * t);

        currentThickness = nearThickness * (1.0 - smoothT) + farThickness * smoothT;
        currentIntensity = nearIntensity * (1.0 - smoothT) + farIntensity * smoothT;
        currentFalloff   = nearFalloff   * (1.0 - smoothT) + farFalloff   * smoothT;
        
        currentColor = Cesium.Cartesian3.lerp(glowColorNear, glowColorFar, smoothT, new Cesium.Cartesian3());
    });
}
