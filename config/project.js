'use strict';

const path = require('path');
const _ = require('lodash');
const packagejson = require(path.resolve('package.json'));
const globs = require('../lib/globs');

const config = packagejson.wix || {};
const externalUnprocessedModules = [
  'wix-style-react/src'
].concat(getConfig('externalUnprocessedModules', []));

const allSourcesButExternalModules = function (path) {
  return path.startsWith(process.cwd()) && !path.includes('node_modules');
};

module.exports = {
  specs: {
    node: () => getConfig('specs.node'),
    browser: () => getConfig('specs.browser')
  },
  output: {
    library: () => getConfig('output.library'),
    libraryTarget: () => getConfig('output.libraryTarget', 'var')
  },
  clientProjectName: () => getConfig('clientProjectName'),
  clientFilesPath: () => {
    const clientProjectName = getConfig('clientProjectName');
    const dir = getConfig('servers.cdn.dir');
    return clientProjectName ?
      `node_modules/${clientProjectName}/${dir || globs.multipleModules.clientDist()}` :
      (dir || globs.singleModule.clientDist());
  },
  isUniversalProject: () => getConfig('universalProject'),
  isAngularProject: () => !!_.get(packagejson, 'dependencies.angular', false),
  servers: {
    cdn: {
      port: () => getConfig('servers.cdn.port', 3200)
    }
  },
  entry: () => getConfig('entry'),
  defaultEntry: () => './client',
  separateCss: () => getConfig('separateCss', true),
  cssModules: () => getConfig('cssModules', true),
  tpaStyle: () => getConfig('tpaStyle', false),
  externals: () => getConfig('externals'),
  babel: () => _.get(packagejson, 'babel'),
  runIndividualTranspiler: () => getConfig('runIndividualTranspiler', true),
  unprocessedModules: () => path => {
    const externalRegexList = externalUnprocessedModules
      .map(m => new RegExp(`node_modules/${m}`));

    return externalRegexList.some(regex => regex.test(path)) ||
      allSourcesButExternalModules(path);
  },
  jestConfig: () => _.get(packagejson, 'jest', {})
};

function getConfig(key, defaultVal = false) {
  return _.get(config, key, defaultVal);
}
