<p align="center">
  <img src="AilurusGIS/Sprites/Logos/LogoFullTracingLow.png" alt="AilurusGIS" width="520">
</p>

# AilurusGIS

AilurusGIS is an interactive 3D GIS web application built with Cesium and Flask.

## Features

- interactive 3D globe
- weather and wind visualization
- air quality layers
- earthquakes and precipitation
- satellite tracking
- borders and tectonic plates
- bathymetry and OSM buildings
- personal POI markers
- basic visitor analytics
- desktop and mobile layouts

## Quick start

```bash
python -m venv .venv
```

Activate the environment and install dependencies:

```bash
pip install -r requirements.txt
```

Create the local configuration file:

```bash
copy .env.example .env
```

On Linux or macOS use:

```bash
cp .env.example .env
```

Fill in the required values in `.env` and start the server:

```bash
python server.py
```

Open:

```text
http://localhost:50010
```

## Configuration

The application reads private values from `.env`:

```text
CESIUM_ION_TOKEN=
AQICN_API_TOKEN=
OPEN_METEO_API_KEY=
ANALYTICS_API_KEY=
```

`.env` is excluded by `.gitignore` and must not be committed. The repository contains only `.env.example` with empty values.

Cesium Ion runs in the browser, so its runtime token can still be inspected by a site visitor. Restrict that token by allowed URLs in the Cesium Ion account.

If a token was previously committed to a public repository, rotate it because removing it from the current files does not remove it from Git history.

## Project structure

```text
AilurusGIS/
├── Cesium/
├── DB/
├── GeoData/
├── JSFiles/
├── Music/
├── PythonFiles/
├── Sprites/
├── index_main.html
├── index_cesium.html
├── server.py
├── .env.example
└── requirements.txt
```

## GitHub

The repository can be stored on GitHub normally. GitHub Pages alone cannot run the Flask and SQLite API routes used by the application, so a Python capable host is required for the full project.
