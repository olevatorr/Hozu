# City bikes — specification

Build a server-rendered explorer of bike stations with interactive visualisations. Style it with Tailwind so it looks
clean; the exact look is up to you. The DOM contract below (text, roles, labels, attributes) is fixed because
automated checks use it.

Use these npm packages, installed into the app: `leaflet` (map), `chart.js` (chart), `gsap` (animation) and `three`
(3D). Nothing may load from a CDN or a map tile server: the map has **no tile layer** (markers on a blank map).

## Data
An in-memory store on the server, seeded with these stations (bikes = bikes available now):

| id | name | district | lat | lng | bikes | docks |
|---|---|---|---|---|---|---|
| s1 | Central Station | Central | 25.0478 | 121.5170 | 12 | 20 |
| s2 | City Hall | Xinyi | 25.0375 | 121.5637 | 3 | 16 |
| s3 | Riverside Park | Datong | 25.0636 | 121.5090 | 0 | 12 |
| s4 | Night Market | Datong | 25.0550 | 121.5153 | 7 | 14 |
| s5 | Tech Park | Neihu | 25.0797 | 121.5752 | 15 | 24 |
| s6 | Lakeside | Neihu | 25.0840 | 121.5890 | 5 | 10 |
| s7 | Museum | Central | 25.0405 | 121.5190 | 9 | 18 |
| s8 | Tower Plaza | Xinyi | 25.0339 | 121.5645 | 11 | 22 |

Favourites are a server-side set of station ids (one set for everyone, no accounts), initially empty. It persists across
page reloads while the server runs.

## Page `/`
- `<h1>` with the text `City bikes`.
- **Search:** a text input with the accessible label `Search`. Typing filters the stations by name (case-insensitive
  substring) immediately, without reloading the page. Without JavaScript, the URL `/?q=park` renders the filtered page.
  "Visible stations" below means the stations matching the search.
- **Total:** a paragraph with the text `Available bikes: <n>`, where `<n>` is the sum of `bikes` over the visible
  stations. When it changes, the number counts to the new value with a GSAP tween lasting 0.4–1.2 s; when the user
  prefers reduced motion, it changes at once. The final text is always the exact sum.
- **List:** a `<ul>` with the accessible name `Stations` (`aria-label`). One `<li>` per visible station, favourites
  first, then by name. Each `<li>` contains:
  - a button whose text is the station name (clicking it selects the station),
  - the district, and the text `<n> bikes`,
  - a button `Favorite` (when not a favourite) or `Unfavorite` (when it is), with `aria-pressed` `false` / `true`. It
    updates the server; the order and the button change at once and survive a reload.
- **Map:** an element with `role="region"` and `aria-label="Map"` containing a Leaflet map with one `L.marker` per
  visible station, created with the option `title: <station name>`. Clicking a marker selects its station. The selected
  station's marker element has the attribute `data-selected="true"`, and the map pans to it.
- **Details:** when a station is selected, an element with `role="region"` and `aria-label="Station details"` shows an
  `<h2>` with the station name and the texts `Bikes: <n>` and `Docks: <n>`. It fades in with GSAP (at least 0.2 s)
  unless the user prefers reduced motion. Nothing is selected on first load.
- **Chart:** a Chart.js bar chart on a `<canvas>` with `role="img"` and `aria-label="Bikes by district"`: one bar per
  district that has a visible station, its height the sum of `bikes`. Next to it, a `<table>` whose `<caption>` is
  `Bikes by district` with one row per such district (`<th>` district name, `<td>` sum), sorted by district name. Both
  update when the search changes.
- **Globe:** an element with `role="region"` and `aria-label="Globe"` containing a `<canvas>` rendered with Three.js: a
  sphere with one small dot per visible station. It rotates slowly on its own, and dragging with the mouse rotates it.
  When the user prefers reduced motion it does not rotate on its own (dragging still works).
- **Without JavaScript**, the page still shows the heading, the total, the list (also with `?q=`), and `Favorite` /
  `Unfavorite` still work. The map, details, chart and globe need JavaScript.
- No errors in the browser console.

## Done means
- The framework's own checks pass (type checking and any validator the framework provides).
- The server starts with a single command and honours the `PORT` environment variable.
