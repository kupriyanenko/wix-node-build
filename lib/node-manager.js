'use strict';

const fs = require('fs');

function updateVersion() {
  const fwVersion = fs.readFileSync(require.resolve('../templates/.nvmrc')).toString();
  const projectVersion = fs.readFileSync('.nvmrc').toString();

  if (fwVersion > projectVersion) {
    fs.writeFileSync('.nvmrc', fwVersion);
  }
}

module.exports = {
  updateVersion
};
