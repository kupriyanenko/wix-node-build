'use strict';

const glob = require('glob');
const path = require('path');
const getWebpackConfigCommon = require('./webpack.config.common');
const mergeByConcat = require('../lib/utils').mergeByConcat;
const globs = require('../lib/globs');
const projectConfig = require('./project');

const specsGlob = projectConfig.specs.browser() || globs.specs();

module.exports = () => {
  return mergeByConcat(getWebpackConfigCommon(), {
    entry: glob.sync(specsGlob).map(p => path.resolve(p)),

    output: {
      path: path.resolve('dist'),
      filename: 'specs.bundle.js'
    },
    module: {
      loaders: [
        require('../lib/loaders/sass')(false, projectConfig.cssModules(), projectConfig.tpaStyle()).specs
      ]
    },
    externals: {
      cheerio: 'window',
      'react/addons': true,
      'react/lib/ExecutionEnvironment': true,
      'react/lib/ReactContext': true
    }
  });
};
