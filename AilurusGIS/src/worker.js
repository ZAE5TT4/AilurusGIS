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

async function serveAsset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

async function proxyOpenMeteo(request, targetBase) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(targetBase);
  targetUrl.search = sourceUrl.search;

  const response = await fetch(targetUrl.toString());
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function proxyAqi(request, env, type) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || env.AQICN_API_TOKEN;

  if (!token) {
    return json({ status: "error", data: "AQICN_API_TOKEN is not configured" }, 500);
  }

  let targetUrl;

  if (type === "geo") {
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return json({ status: "error", data: "lat and lon are required" }, 400);
    }

    targetUrl = new URL(`https://api.waqi.info/feed/geo:${lat};${lon}/`);
    targetUrl.searchParams.set("token", token);
  } else if (type === "bounds") {
    const latMin = url.searchParams.get("latMin");
    const lonMin = url.searchParams.get("lonMin");
    const latMax = url.searchParams.get("latMax");
    const lonMax = url.searchParams.get("lonMax");

    if (!latMin || !lonMin || !latMax || !lonMax) {
      return json({ status: "error", data: "latMin, lonMin, latMax, lonMax are required" }, 400);
    }

    targetUrl = new URL("https://api.waqi.info/map/bounds/");
    targetUrl.searchParams.set("latlng", `${latMin},${lonMin},${latMax},${lonMax}`);
    targetUrl.searchParams.set("token", token);
  } else {
    return json({ status: "error", data: "Unknown AQI route" }, 404);
  }

  const response = await fetch(targetUrl.toString());
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function proxyTle(request, ctx) {
  const url = new URL(request.url);
  const group = (url.searchParams.get("group") || "active").toLowerCase();

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
    return json({ error: `Group '${group}' not allowed` }, 400);
  }

  const targetUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const cache = caches.default;
  const cacheRequest = new Request(targetUrl);

  const cached = await cache.match(cacheRequest);
  if (cached) {
    return cached;
  }

  const response = await fetch(targetUrl);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=21600");

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  ctx.waitUntil(cache.put(cacheRequest, finalResponse.clone()));
  return finalResponse;
}

async function proxySatelliteJs(ctx) {
  const targetUrl = "https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js";
  const cache = caches.default;
  const cacheRequest = new Request(targetUrl);

  const cached = await cache.match(cacheRequest);
  if (cached) {
    return cached;
  }

  const response = await fetch(targetUrl);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/javascript; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=604800");

  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  ctx.waitUntil(cache.put(cacheRequest, finalResponse.clone()));
  return finalResponse;
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
          "Access-Control-Allow-Headers": "Content-Type, X-User-Token"
        }
      });
    }

    if (path === "/") {
      return serveAsset(env, request, "/index.html");
    }

    if (path === "/map") {
      return serveAsset(env, request, "/map/index.html");
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

    if (
      path.startsWith("/api/cities/") ||
      path.startsWith("/api/poi") ||
      path.startsWith("/api/analytics/") ||
      path.startsWith("/api/borders/shp")
    ) {
      return json({
        error: "Этот Flask/SQLite/Python endpoint на Cloudflare Worker пока не перенесён."
      }, 501);
    }

    return env.ASSETS.fetch(request);
  }
};