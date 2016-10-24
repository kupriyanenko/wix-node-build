'use strict';

const path = require('path');
const fs = require('fs');
const gulp = require('gulp');
const gutil = require('gulp-util');
const express = require('express');
const {spawn} = require('child_process');
const webpackMiddleware = require('webpack-dev-middleware');
const utils = require('./../../utils');
const projectConfig = require('./../../../config/project');
const {getCompiler} = require('./../webpack');
const debug = require('debug')('wix:server');
const debugWebpack = require('debug')('wix:webpack');

module.exports = (options, loadTasks) => {
  let server;

  const port = projectConfig.servers.cdn.port();
  const clientFilesPath = projectConfig.clientFilesPath();
  const compiler = getCompiler({debug: true, hot: options.hot});

  const runServer = () => {
    const env = Object.create(process.env);
    if (server) {
      server.kill('SIGTERM');
    } else {
      console.log('');
      gutil.log('Application is now available at ',
        gutil.colors.magenta(`http://localhost:3000${env.MOUNT_POINT || '/'}`));
      gutil.log('Server log is written to ', gutil.colors.magenta('./target/server.log'));
      gulp.start('mocha');
    }

    env.NODE_ENV = 'development';
    env.DEBUG = 'wix:*,wnp:*';

    server = spawn('node', [path.resolve(options.entryPoint)], {env});
    [server.stdout, server.stderr].forEach(stream =>
      stream.on('data', writeToServerLog)
    );
    if (debug.enabled) {
      server.stdout.on('data', writeToConsole());
    }
    server.stderr.pipe(process.stderr);

    return server;
  };

  // TODO: change gulp tasks to simple async functions
  loadTasks({
    done: options.server ? runServer : utils.noop,
    watch: true
  });

  gulp.start(utils.isTypescriptProject() ? 'typescript' : 'babel');

  gulp.start('sass');
  gulp.start('copy-assets');

  if (!options.server) {
    gulp.start('mocha');
  }

  const app = express()
    .use(getCorsMiddleware());

  if (compiler) {
    app.use(getWebpackDevMiddleware(compiler));
    if (options.hot) {
      app.use(require('webpack-hot-middleware')(compiler));
    }
  }

  app.use(express.static(clientFilesPath))
    .listen(port, 'localhost');
};

function getCorsMiddleware() {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Origin', '*');

    next();
  };
}

function getWebpackDevMiddleware(compiler) {
  try {
    return webpackMiddleware(compiler, {
      noInfo: !debugWebpack.enabled,
      stats: {
        colors: true
      }
    });
  } catch (e) {
    console.error(e);
    return (req, res, next) => next();
  }
}

function writeToServerLog(data) {
  fs.appendFile('target/server.log', data);
}

function writeToConsole() {
  return function (buff) {
    const data = buff.toString('utf8');
    if (!data.trim()) {
      return;
    }
    data
      .split('\n')
      .filter(Boolean)
      .map(line => 'EP: ' + line)
      .forEach(gutil.log.bind(gutil));
  };
}
