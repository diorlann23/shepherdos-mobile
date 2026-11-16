// Adds what can't live in app.json because it differs per machine or is kept out of git.
// Android push notifications need the Firebase file for com.shepherdos.app:
//  - on EAS: upload it as a file environment variable named GOOGLE_SERVICES_JSON;
//  - locally: put google-services.json next to this file (it's ignored by git).
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
