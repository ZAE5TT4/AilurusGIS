/* * * усовершенствованный эффект объемной тени без мерцания * использует чистую математику (raycasting) вместо слоев глубины * что позволяет тени идеально ложиться поверх атмосферы и не затрагивать космос * @param {cesiumviewer} viewer */
// объявление функции
function applyGlobeShadow(viewer) {
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;

    const shadowShader = `
        uniform sampler2D colorTexture;
        uniform sampler2D depthTexture;
        uniform float shadowIntensity;
        
        in vec2 v_textureCoordinates;

        void main(void) {
            vec4 color = texture(colorTexture, v_textureCoordinates);
            
            float depth = czm_readDepth(depthTexture, v_textureCoordinates);
            // проверка условия
            if (depth < 0.00001) {
                out_FragColor = color;
                // возврат результата
                return;
            }

            // проверка условия
            if (shadowIntensity <= 0.0) {
                out_FragColor = color;
                // возврат результата
                return;
            }

            vec4 clipPos = vec4(v_textureCoordinates * 2.0 - 1.0, 1.0, 1.0);
            vec4 eyePos = czm_inverseProjection * clipPos;
            vec3 rayDir = normalize(eyePos.xyz / eyePos.w);
            
            vec3 earthCenterEC = (czm_view * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float radius = 6480000.0; 
            
            vec3 oc = -earthCenterEC; 
            float b = dot(rayDir, oc);
            float c = dot(oc, oc) - radius * radius;
            float discriminant = b * b - c;
            
            float finalShadow = 1.0;
            
            // проверка условия
            if (discriminant > 0.0) {
                float t = -b - sqrt(discriminant); 
                
                // проверка условия
                if (t > 0.0) {
                    vec3 hitPos = rayDir * t;
                    vec3 normal = normalize(hitPos - earthCenterEC);
                    
                    vec3 toLight = normalize(vec3(-0.1, 0.1, 0.2)); 
                    float diffuse = max(dot(normal, toLight), 0.0);
                    
                    float shadow = smoothstep(0.0, 0.40, diffuse);
                    finalShadow = mix(1.0, shadow, shadowIntensity);
                }
            }
            
            out_FragColor = vec4(color.rgb * finalShadow, color.a);
        }
    `;

    // 3 добавляем нашу тень в систему рендеринга
    const globeShadowStage = viewer.scene.postProcessStages.add(
        new Cesium.PostProcessStage({
            fragmentShader: shadowShader,
            uniforms: {
                shadowIntensity: 0.0
            }
        })
    );
    window.__globeShaderStages = window.__globeShaderStages || {};
    window.__globeShaderStages.shadow = globeShadowStage;

    // 4 плавно меняем силу тени при зуме камеры
    viewer.scene.preUpdate.addEventListener(function() {
        const camera = viewer.camera;
        
        // получаем высоту
        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);
        const height = cartographic ? cartographic.height : 0;
        
        // настройки высоты
        // 2 000 км: тень полностью прозрачная (видно всю карту)
        const minHeight = 2000000.0;  
        // 12 000 км: тень черная и плотная
        const maxHeight = 12000000.0; 
        
        let t = (height - minHeight) / (maxHeight - minHeight);
        t = Math.max(0.0, Math.min(1.0, t));
        
        // плавная математическая кривая
        let smoothT = t * t * (3.0 - 2.0 * t);
        
        // передаем интенсивность в шейдер
        globeShadowStage.uniforms.shadowIntensity = smoothT;
    });
}
