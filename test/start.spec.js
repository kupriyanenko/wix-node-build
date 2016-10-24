'use strict';

const fp = require('lodash/fp');
const expect = require('chai').expect;

const tp = require('./helpers/test-phases');
const fx = require('./helpers/fixtures');
const fetch = require('node-fetch');
const retryPromise = require('retry-promise').default;
const hooks = require('./helpers/hooks');
const logTest = require('./helpers/log-test');

describe('Aggregator: start', () => {
  let test;

  beforeEach(() => {
    test = tp.create();
  });

  afterEach('check stderr', function () {
    expect(test.stderr.trim()).to.be.empty;
  });

  afterEach('log on fail', function () {
    if (this.currentTest.state === 'failed') {
      logTest(test);
    }
  });

  afterEach('kill spawned', function () {
    if (this.currentTest.state === 'failed') {
      console.log('Tmp dir is', test.tmp);
      console.log('node', test.args.join(' '));
      return test.teardown(process.env.KEEP_ON_FAIL === 'true');
    }
    return test.teardown();
  });


  describe('tests', function () {
    it('should run tests initially', () => {
      test
        .setup({
          'src/test.spec.js': '',
          'index.js': `console.log('hello world!')`,
          'src/client.js': '',
          'entry.js': '',
          'package.json': fx.packageJson(),
          'pom.xml': fx.pom()
        })
        .spawn('start');

      return checkServerLogCreated().then(() =>
        expect(test.stdout).to.contains('Testing with Mocha')
      );
    });
  });

  describe('--entry-point', () => {
    it('should run the entry point provided', () => {
      test
        .setup({
          'src/client.js': '',
          'entry.js': `console.log('hello world!')`,
          'package.json': fx.packageJson(),
          'pom.xml': fx.pom()
        })
        .spawn('start', '--entry-point=entry');

      return checkServerLogCreated().then(() =>
        expect(test.content('target/server.log')).to.contains('hello world!')
      );
    });

    it('should run index.js by default', () => {
      test
        .setup({
          'src/test.spec.js': '',
          'src/client.js': '',
          'index.js': `console.log('hello world!')`,
          'package.json': fx.packageJson(),
          'pom.xml': fx.pom()
        })
        .spawn('start');

      return checkServerLogCreated().then(() =>
        expect(test.content('target/server.log')).to.contains('hello world!')
      );
    });

    it('should show server errors', function () {
      this.timeout(30000);
      test
        .setup({
          'src/test.spec.js': '',
          'src/client.js': '',
          'index.js': `console.error('error message!'); require('sa')`,
          'package.json': fx.packageJson(),
          'pom.xml': fx.pom()
        })
        .spawn('start');

      return checkServerLogCreated()
        .then(() => {
          expect(test.content('target/server.log')).to.contains('error message!');
          expect(test.stderr)
            .to.contain('error message!')
            .to.contain(`Cannot find module 'sa'`);
          test.stderr = '';
        })
        .then(() => test.modify('index.js', fx.httpServer('hello')))
        .then(() => checkServerIsRespondingWith('hello'));
    });
  });

  describe('--no-server', () => {
    it('should not start a server if --no-server is passed', () => {
      test
        .setup(getFiles({
          'dist/statics/image.png': '',
          'index.js': `console.log('should not run');`,
          'package.json': fx.packageJson({servers: {cdn: {port: 3005}}})
        }))
        .spawn('start', ['--no-server']);

      return cdnIsServing('image.png')
        .then(() => expect(test.stdout).not.to.contain('should not run'));
    });
  });

  describe('--hot', () => {
    it('should create bundle with enabled hot module replacement', () => {
      test
        .setup(getFiles({
          'src/client.js': `console.log('client-content');`,
          'index.js': `console.log('should run');`,
          'package.json': fx.packageJson()
        }))
        .spawn('start', ['--hot']);

      return fetchCDN('/app.bundle.js')
        .then(resp => resp.text())
        .then(file => {
          file = file.replace(/\s+/g, ' ');
          expect(file).to.include(`if (false) { throw new Error("[HMR] Hot Module Replacement is disabled."); }`)
            .and.include(`console.log('client-content');`)
            .and.not.include('Cannot find module');
        });
    });
  });

  describe('CDN server', () => {
    it('should run cdn server with default dir', () => {
      test
        .setup(getFiles({
          'dist/statics/test.json': '{a: 1}',
          'dist/index.js': 'var a = 1;',
          'package.json': fx.packageJson({servers: {cdn: {port: 3005}}})
        }))
        .spawn('start');

      return cdnIsServing('test.json');
    });

    it('should run cdn server with configured dir', () => {
      test
        .setup(getFiles({
          'dist/statics/test.json': '{a: 1}',
          'dist/index.js': 'var a = 1;',
          'package.json': fx.packageJson({servers: {cdn: {port: 3005, dir: 'dist/statics'}}})
        }))
        .spawn('start');

      return cdnIsServing('test.json');
    });

    it('should run cdn server from node_modules, on n-build project, using default dir', () => {
      test
        .setup(getFiles({
          'node_modules/my-client-project/dist/test.json': '{a: 1}',
          'dist/index.js': 'var a = 1;',
          'package.json': fx.packageJson({clientProjectName: 'my-client-project', servers: {cdn: {port: 3005}}})
        }))
        .spawn('start');

      return cdnIsServing('test.json');
    });

    it('should run cdn server from node_modules, on n-build project, using configured dir', () => {
      test
        .setup(getFiles({
          'node_modules/my-client-project/dist/statics/test.json': '{a: 1}',
          'dist/index.js': 'var a = 1;',
          'package.json': fx.packageJson(
            {clientProjectName: 'my-client-project', servers: {cdn: {port: 3005, dir: 'dist/statics'}}})
        }))
        .spawn('start');

      return cdnIsServing('test.json');
    });

    it('should support cross origin requests headers', () => {
      test
        .setup(getFiles())
        .spawn('start');


      return fetchCDN().then(res => {
        expect(res.headers.get('Access-Control-Allow-Methods')).to.equal('GET, OPTIONS');
        expect(res.headers.get('Access-Control-Allow-Origin')).to.equal('*');
      });
    });
  });

  describe('Watch', function () {
    this.timeout(30000);

    describe('when using typescript', () => {
      it(`should rebuild and restart server after a file has been changed with typescript files`, () => {
        test
          .setup({
            'target/server.log': '', // TODO: understand why test fails with Error: ENOENT: no such file or directory, open 'target/server.log'
            'tsconfig.json': fx.tsconfig(),
            'src/server.ts': `declare var require: any; ${fx.httpServer('hello')}`,
            'src/config.ts': '',
            'src/client.ts': '',
            'index.js': `require('./dist/src/server')`,
            'src/test.spec.js': `console.log('test.spec.js')`,
            'package.json': fx.packageJson(),
            'pom.xml': fx.pom()
          })
          .spawn('start');

        return checkServerIsUp({max: 100})
          .then(() => checkServerIsRespondingWith('hello'))
          .then(() => test.modify('src/server.ts', `declare var require: any; ${fx.httpServer('world')}`))
          .then(() => checkServerIsRespondingWith('world'));
      });
    });

    describe('when using es6', () => {
      it(`should rebuild and restart server after a file has been changed`, () => {
        test
          .setup({
            'src/server.js': fx.httpServer('hello'),
            'src/test.spec.js': '',
            'src/config.js': '',
            'src/client.js': '',
            'index.js': `require('./src/server')`,
            'package.json': fx.packageJson(),
            'pom.xml': fx.pom()
          })
          .spawn('start');

        return checkServerIsUp()
          .then(() => checkServerIsRespondingWith('hello'))
          .then(() => test.modify('src/server.js', fx.httpServer('world')))
          .then(() => checkServerIsRespondingWith('world'));
      });
    });

    it.skip('should make a new bundle after the file has beend changed', () => {
      test.setup({
        'index.js': fx.httpServer(),
        'src/client.js': 'require(\'./menu\').create();',
        'src/client.spec.js': 'require(\'./menu\').create();',
        'src/menu.js': 'module.exports.create = function () {console.log(\'Initializing the menu!\')}',
        'package.json': fx.pkgJsonWithBuild()
      }, [hooks.linkWixNodeBuild]).execute('build', '--bundle');
      test.spawn('start', '-w');

      return checkServerIsUp()
        .then(() => test.modify('src/client.js', content => 'const menu = ' + content))
        .then(() => checkServerRestarted())
        .then(() => {
          expect(test.content('dist/statics/main.bundle.js')).to.contain('const menu =');
          expect(test.list('dist')).to.contain('specs.bundle.js');
        });
    });
  });

  function getFiles(overrides) {
    return fp.defaults({
      'src/test.spec.js': `console.log('test.spec.js')`,
      'src/client.js': `console.log('client.js')`,
      'index.js': `console.log('running internal server');`,
      'package.json': fx.packageJson()
    })(overrides);
  }

  function checkServerLogCreated() {
    return retryPromise({backoff: 400}, () =>
      test.contains('target/server.log') ?
        Promise.resolve() :
        Promise.reject(new Error('Log was not created'))
    );
  }

  function fetchCDN(path = '/', port = 3200) {
    return retryPromise({backoff: 100}, () => fetch(`http://localhost:${port}${path}`));
  }

  function cdnIsServing(name) {
    return retryPromise({backoff: 100}, () =>
      fetch(`http://localhost:3005/${name}`).then(res => expect(res.status).to.equal(200)));
  }

  function checkServerIsRespondingWith(expected) {
    return retryPromise({backoff: 500}, () =>
      fetch(`http://localhost:6666/`)
        .then(res => res.text())
        .then(body => body === expected ? Promise.resolve() : Promise.reject(new Error(`Did not met ${expected}`)))
    );
  }

  function checkServerIsUp(opts) {
    return retryPromise(fp.merge({backoff: 100}, opts), () =>
      fetch(`http://localhost:6666/`)
    );
  }

  function checkServerIsDown() {
    return retryPromise({backoff: 10}, () =>
      new Promise((resolve, reject) => {
        fetch('http://localhost:6666/').then(reject, resolve);
      }));
  }

  function checkServerRestarted() {
    return checkServerIsDown().then(() => checkServerIsUp());
  }
});
