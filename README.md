# Hello World UI

A minimal static hello-world page served by nginx in a Docker container.

## Files

- `public/index.html` — the page
- `public/styles.css` — styling (light/dark aware)
- `public/app.js` — cycles through greetings on button click
- `Dockerfile` — nginx image with the page baked in

## Run with Docker

```bash
docker build -t hello-world-ui .
docker run --rm -p 8080:80 hello-world-ui
```

Then open http://localhost:8080

## Run without Docker

```bash
python3 -m http.server 8080 --directory public
```
