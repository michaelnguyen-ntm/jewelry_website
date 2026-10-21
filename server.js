// Local development server. On Vercel, public/ is served statically and
// api/index.js handles the API, so this file is not used there.
const path = require('path');
const express = require('express');
const app = require('./lib/app');

const publicDir = path.join(__dirname, 'public');

app.use(express.static(publicDir, { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));

const port = process.env.PORT || 3010;
app.listen(port, () => console.log(`PNJ demo running at http://localhost:${port}`));
