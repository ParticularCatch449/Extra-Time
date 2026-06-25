# Extra Time [Stremio](https://www.stremio.com/) Addon

Watch goals and highlights from the latest football matches from around the world.

Based on [jamesalester/Extra-Time](https://github.com/jamesalester/Extra-Time). This copy is maintained at [ParticularCatch449/Extra-Time](https://github.com/ParticularCatch449/Extra-Time).

![Extra Time Preview](./preview.png)

## Installation

### In Stremio

Search for **Extra Time** in Stremio’s add-on catalog if it is listed there. Otherwise use one of the options below.

### Add from URL (hosted)

Deploy this repository to [Vercel](https://vercel.com/) (see [Deployment](#deployment)), then paste your deployment URL with `/manifest.json` into the add-on search field in Stremio, for example:

```
https://your-project.vercel.app/manifest.json
```

The legacy `extra-time.now.sh` deployment is no longer available.

### Run locally

Install [Node.js](https://nodejs.org/) 18+, then run:

```
git clone https://github.com/ParticularCatch449/Extra-Time.git
cd Extra-Time
pnpm install
pnpm start
```

In Stremio’s add-on search field, use:

```
http://127.0.0.1:62380/manifest.json
```

## Deployment

1. Fork or use this repository on GitHub.
2. Import the project in Vercel and connect the GitHub repo.
3. Vercel reads `vercel.json` (Node 18, `pnpm install`, serverless entry `serverless.js`).
4. After deploy, install the add-on in Stremio using `https://<your-vercel-domain>/manifest.json`.

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright (c) James A Lester.
