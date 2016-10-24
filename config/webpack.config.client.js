'use strict';

const webpack = require('webpack');
const path = require('path');
const _ = require('lodash');
const autoprefixer = require('autoprefixer');
const {mergeByConcat} = require('./../lib/utils');
const webpackConfigCommon = require('./webpack.config.common');
const {bundleEntry, separateCss, indexFile} = require('./project');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const config = ({debug, hot} = {}) => {
  const entry = bundleEntry() || {app: './client'};
  const extractCSS = hot ? null : getExtractCss();
  const sass = require('../lib/loaders/sass')(extractCSS);

  return mergeByConcat(webpackConfigCommon, {
    entry: hot ? addHotEntries(entry) : entry,

    module: {
      loaders: [
        sass.client
      ]
    },

    plugins: [
      ...hot ? [new webpack.HotModuleReplacementPlugin()] : [],

      new webpack.DefinePlugin({
        'process.env.NODE_ENV': debug ? '"development"' : '"production"'
      }),

      ...extractCSS ? [extractCSS] : [],

      ...debug ? [] : [
        new webpack.optimize.UglifyJsPlugin({
          compress: {
            warnings: true,
          },
        })
      ],

      ...indexFile() ? getIndexPlugin(entry, indexFile()) : []
    ],

    output: {
      path: path.resolve('./dist/statics'),
      filename: debug ? '[name].bundle.js' : '[name].bundle.min.js'
    },

    postcss: () => [autoprefixer],

    target: 'web'
  });

  function getExtractCss() {
    if (separateCss()) {
      const ExtractTextPlugin = require('extract-text-webpack-plugin');
      return new ExtractTextPlugin(debug ? '[name].css' : '[name].min.css');
    }
  }

  function addHotEntries(entries) {
    return _.mapValues(entries, entry => {
      entry = _.isArray(entry) ? entry : [entry];
      return [
        require.resolve('webpack-hot-middleware/client') + '?reload=true',
        require.resolve('webpack/hot/dev-server')
      ].concat(entry);
    });
  }

  function getIndexPlugin(entries, options) {
    if (_.isString(options)) {
      options = {template: options};
    }
    options = options || {};
    const minSuffix = debug ? '' : '.min';
    return Object.keys(entries)
      .map(entryName => {
        const substitute = tpl => tpl && tpl.replace(/\[name]/g, entryName);
        return new HtmlWebpackPlugin(_.pickBy({ //  plugin uses _.extend, so we need to provide only non empty values
          filename: `${entryName}${minSuffix}.html`,
          chunks: options.chunks && _.map(options.chunks, substitute),
          template: options.template && substitute(options.template)
        }));
      });
  }
};

module.exports = config;
