function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function proxyOpenMeteo(request, targetBase) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(targetBase);

  targetUrl.search = sourceUrl.search;

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "AilurusGIS/1.0"
      }
    });

    return withCors(response);
  } catch (error) {
    return json({
      error: true,
      reason: String(error)
    }, 502);
  }
}

async function proxyAqi(request, env, type) {
  const url = new URL(request.url);

  const defaultToken = "68f7e90d5c4016cf4a7e1ebc8b685acf315a246d";
  const token = url.searchParams.get("token") || env.AQICN_API_TOKEN || defaultToken;

  let targetUrl;

  if (type === "geo") {
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return json({
        status: "error",
        data: "lat and lon are required"
      }, 400);
    }

    targetUrl = new URL(`https://api.waqi.info/feed/geo:${lat};${lon}/`);
    targetUrl.searchParams.set("token", token);
  } else if (type === "bounds") {
    const latMin = url.searchParams.get("latMin");
    const lonMin = url.searchParams.get("lonMin");
    const latMax = url.searchParams.get("latMax");
    const lonMax = url.searchParams.get("lonMax");

    if (!latMin || !lonMin || !latMax || !lonMax) {
      return json({
        status: "error",
        data: "latMin, lonMin, latMax, lonMax are required"
      }, 400);
    }

    targetUrl = new URL("https://api.waqi.info/map/bounds/");
    targetUrl.searchParams.set("latlng", `${latMin},${lonMin},${latMax},${lonMax}`);
    targetUrl.searchParams.set("token", token);
  } else {
    return json({
      status: "error",
      data: "Unknown AQI route"
    }, 404);
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "AilurusGIS/1.0"
      }
    });

    return withCors(response);
  } catch (error) {
    return json({
      status: "error",
      data: String(error)
    }, 502);
  }
}

async function proxyTle(request, ctx) {
  const url = new URL(request.url);
  const group = (url.searchParams.get("group") || "active").trim().toLowerCase();

  const allowedGroups = new Set([
    "active",
    "starlink",
    "stations",
    "weather",
    "noaa",
    "goes",
    "resource"
  ]);

  if (!allowedGroups.has(group)) {
    return json({
      error: `Group '${group}' not allowed`
    }, 400);
  }

  const targetUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;

  const cache = caches.default;
  const cacheRequest = new Request(targetUrl, {
    method: "GET"
  });

  const cached = await cache.match(cacheRequest);

  if (cached) {
    const cachedHeaders = new Headers(cached.headers);
    cachedHeaders.set("Access-Control-Allow-Origin", "*");
    cachedHeaders.set("X-Proxy-Cache", "HIT");

    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cachedHeaders
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AilurusGIS/1.0"
      }
    });

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=21600");
    headers.set("X-Proxy-Cache", "MISS");

    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

    if (response.ok) {
      ctx.waitUntil(cache.put(cacheRequest, finalResponse.clone()));
    }

    return finalResponse;
  } catch (error) {
    return json({
      error: String(error)
    }, 502);
  }
}

async function proxySatelliteJs(ctx) {
  const targetUrl = "https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js";

  const cache = caches.default;
  const cacheRequest = new Request(targetUrl, {
    method: "GET"
  });

  const cached = await cache.match(cacheRequest);

  if (cached) {
    const cachedHeaders = new Headers(cached.headers);
    cachedHeaders.set("Access-Control-Allow-Origin", "*");
    cachedHeaders.set("X-Proxy-Cache", "HIT");

    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cachedHeaders
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AilurusGIS/1.0"
      }
    });

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/javascript; charset=utf-8");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=604800");
    headers.set("X-Proxy-Cache", "MISS");

    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

    if (response.ok) {
      ctx.waitUntil(cache.put(cacheRequest, finalResponse.clone()));
    }

    return finalResponse;
  } catch (error) {
    return json({
      error: String(error)
    }, 502);
  }
}


async function serveKazakhstanBorders(request, env) {
  const assetUrl = new URL("/GeoData/Borders/kazakhstan.geojson", request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/geo+json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function serveStaticAsset(request, env) {
  /*
   * Важно:
   * Не делаем ручной redirect "/" -> "/index.html".
   * Из-за этого как раз мог появляться ERR_TOO_MANY_REDIRECTS.
   * Просто отдаём статику через Cloudflare Assets.
   */
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-User-Token, X-Analytics-Key",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (path === "/api/open-meteo/forecast") {
      return proxyOpenMeteo(request, "https://api.open-meteo.com/v1/forecast");
    }

    if (path === "/api/open-meteo/air-quality") {
      return proxyOpenMeteo(request, "https://air-quality-api.open-meteo.com/v1/air-quality");
    }

    if (path === "/api/aqi/geo") {
      return proxyAqi(request, env, "geo");
    }

    if (path === "/api/aqi/bounds") {
      return proxyAqi(request, env, "bounds");
    }

    if (path === "/api/tle") {
      return proxyTle(request, ctx);
    }

    if (path === "/api/satellite-js") {
      return proxySatelliteJs(ctx);
    }

    if (path === "/api/borders/kazakhstan" || path === "/api/borders/shp") {
      return serveKazakhstanBorders(request, env);
    }

    /*
     * Эти Flask-эндпоинты пока не перенесены на Cloudflare Workers,
     * потому что они завязаны на Python или SQLite.
     */
    if (
      path.startsWith("/api/cities/") ||
      path.startsWith("/api/poi") ||
      path.startsWith("/api/analytics/")
    ) {
      return json({
        error: "Этот Flask/SQLite/Python endpoint на Cloudflare Worker пока не перенесён."
      }, 501);
    }

    return serveStaticAsset(request, env);
  }
};