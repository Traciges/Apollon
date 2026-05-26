// PM2 process config for the Apollon backend.
// Named .cjs (CommonJS) on purpose: package.json sets "type": "module",
// so a plain .js file would be parsed as ESM and module.exports would fail.
const path = require("path");

// Load variables from .env so they are available to the PM2-managed process.
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  apps: [
    {
      name: "apollon-backend",
      script: "server.js",
      cwd: __dirname,
      watch: false,
      env: {
        ...process.env,
      },
    },
  ],
};
