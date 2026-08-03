# MyFarmBox Singapore — 24 August Countdown

## Replace these files in the existing `singapore` repository

Upload/replace:

- `index.html`
- `styles.css`
- `app.js`
- `assets/myfarmbox-logo.webp`

Keep your existing `dashboard` folder and any other assets you still need.

## Countdown time

The countdown is set to:

`24 August 2026, 12:00 a.m. Singapore time (UTC+8)`

This is configured in `app.js`:

```js
const launchDate = new Date("2026-08-24T00:00:00+08:00").getTime();
```

## Existing registration link

The main buttons currently open:

`https://myfarmbox.github.io/singapore/`

If the registration form moves to another path, replace that link in `index.html`.
