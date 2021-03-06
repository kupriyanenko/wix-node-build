'use strict';

const _ = require('lodash/fp');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const gutil = require('gulp-util');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const getConfig = require('../../config/webpack.config.client');
const {entry, defaultEntry, servers} = require('../../config/project');
const {exists} = require('../utils');
const {start} = require('../server-api');

const existsJs = pattern => exists(`${pattern}.{js,jsx,ts,tsx}`);
const filteredWebpack = _.compose(filterNoise, webpack);

module.exports = {runWebpack, startWebpack};

function runWebpack(options) {
  const config = getConfig(options);
  const compiler = getCompiler(config, options);

  return new Promise((resolve, reject) => {
    if (compiler) {
      compiler.run((err, stats) => err || stats.hasErrors() ? reject(err) : resolve());
    }
  });
}

function startWebpack(options) {
  const config = getConfig(options);

  config.entry = addHotEntries(config.entry);
  config.plugins.push(new webpack.HotModuleReplacementPlugin());
  config.output.publicPath = `http://localhost:${servers.cdn.port()}/`;

  const compiler = getCompiler(config, options);

  const middlewares = !compiler ? [] : [
    webpackDevMiddleware(compiler, {quiet: true}),
    webpackHotMiddleware(compiler)
  ];

  return start({middlewares});
}

function getCompiler(config, {debug}) {
  const defaultEntryPath = path.join(config.context, defaultEntry());

  if (entry() || existsJs(defaultEntryPath)) {
    gutil.log(`Bundling with Webpack (${debug ? 'debug' : 'release'})`);
    return filteredWebpack(config);
  }
}

function filterNoise(comp) {
  comp.plugin('done', stats => {
    gutil.log(stats.toString({
      colors: true,
      hash: false,
      chunks: false,
      assets: false,
      children: false
    }));
    mkdirp.sync(path.resolve('target'));
    fs.writeFileSync('target/webpack-stats.json', JSON.stringify(stats.toJson()));
  });

  return comp;
}

function addHotEntries(entries) {
  return Object.keys(entries).reduce((acc, value) => {
    acc[value] = [
      `${require.resolve('webpack-hot-middleware/client')}?dynamicPublicPath=true&path=__webpack_hmr`
    ].concat(entries[value]);
    return acc;
  }, {});
}
