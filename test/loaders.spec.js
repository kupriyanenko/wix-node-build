'use strict';

const tp = require('./helpers/test-phases');
const fx = require('./helpers/fixtures');
const expect = require('chai').expect;
const hooks = require('./helpers/hooks');
const _ = require('lodash');

describe('Loaders', () => {
  let test;

  beforeEach(() => {
    test = tp.create()
      .setup({
        'src/client.js': '',
        'src/config.js': '',
        'package.json': fx.packageJson(),
        'pom.xml': fx.pom()
      });
  });

  afterEach(() => test.teardown(true));

  describe('Babel', () => {
    it('should transpile according .babelrc file', () => {
      test
        .setup({
          'src/client.js': 'let aServerFunction = 1;',
          '.babelrc': `{"plugins": ["transform-es2015-block-scoping"]}`,
          'package.json': `{\n
            "name": "a",\n
            "dependencies": {\n
              "babel-plugin-transform-es2015-block-scoping": "latest"\n
            }
          }`
        }, [hooks.installDependencies])
        .execute('build');

      expect(test.content('dist/statics/app.bundle.js')).to.contain('var aServerFunction = 1;');
    });
  });

  describe('Typescript', () => {
    it('should transpile', () => {
      test
        .setup({
          'src/app.ts': 'let aServerFunction = 1;',
          'tsconfig.json': fx.tsconfig(),
          'package.json': fx.packageJson({
            entry: './app.ts'
          })
        })
        .execute('build');
      expect(test.content('dist/statics/app.bundle.js')).to.contain('var aServerFunction = 1;');
    });

    it('should fail with error code 1', () => {
      const resp = test
        .setup({
          'src/app.ts': 'function ()',
          'tsconfig.json': fx.tsconfig(),
          'package.json': fx.packageJson({
            entry: './app.ts'
          })
        })
        .execute('build');

      expect(resp.code).to.equal(1);
      expect(resp.stdout).to.contain('TypeScript: 1 syntax error');
    });
  });

  describe('Sass', () => {
    describe('client', () => {
      it('should run sass and css loaders over imported .scss files', () => {
        setupAndBuild();
        expect(test.content('dist/statics/app.bundle.js')).to.match(
          /"some-rule":"some-css__some-rule__\w{5}",([\s\S]*?)"child":"some-css__child__\w{5}"/);
      });

      it('should also expose css classes as camelcase', () => {
        setupAndBuild();
        expect(test.content('dist/statics/app.bundle.js')).to.match(/"someRule":"some-css__some-rule__\w{5}"/);
      });
    });

    describe('detach css', () => {
      it('should create an external app.css file with a source map', () => {
        setupAndBuild();
        expect(test.content('dist/statics/app.css')).to.match(/.\w+/);
        expect(test.content('dist/statics/app.css')).to.contain('color: red');
        expect(test.content('dist/statics/app.css')).to.contain('color: blue');
      });

      it('should keep styles inside the bundle when separateCss equals to false', () => {
        setupAndBuild({separateCss: false});
        expect(test.list('dist/statics')).not.to.contain('app.css');
        expect(test.list('dist/statics')).not.to.contain('app.css.map');
        expect(test.content('dist/statics/app.bundle.js')).to.contain('color: red');
        expect(test.content('dist/statics/app.bundle.js')).to.contain('color: blue');
      });
    });

    function setupAndBuild(config) {
      test
        .setup({
          'src/client.js': `require('./some-css.scss');require('./foo.css');`,
          'src/server.js': `require('./some-css.scss');require('./foo.css');`,
          'src/some-css.scss': '.some-rule { .child { color: red } }',
          'src/foo.css': '.foo-rule { color: blue }',
          'package.json': fx.packageJson(config || {}),
        })
        .execute('build');
    }
  });

  describe('Images', () => {
    it('should embed image below 10kb as base64', () => {
      test
        .setup({
          'src/client.js': `require('./tiny-image.png');`,
          'src/tiny-image.png': 'some-content'
        })
        .execute('build');

      expect(test.content('dist/statics/app.bundle.js')).to.contain('data:image/png;base64,c29tZS1jb250ZW50');
    });

    it('should write a separate image above 10kb', () => {
      test
        .setup({
          'src/client.js': `require('./large-image.png');`,
          'src/large-image.png': _.repeat('a', 10001)
        })
        .execute('build');

      expect(test.content('dist/statics/app.bundle.js')).to.match(/"large-image.png\?\w+"/);
    });
  });

  describe('Json', () => {
    it('should embed json file into bundle', () => {
      test
        .setup({
          'src/client.js': `require('./some.json')`,
          'src/some.json': '{"json-content": 42}'
        })
        .execute('build');
      expect(test.content('dist/statics/app.bundle.js')).to.contain('"json-content": 42');
    });
  });

  describe('Html', () => {
    it('should provide html file', () => {
      test
        .setup({
          'src/client.js': `require('./template.html')`,
          'src/template.html': '<h2>Hello</h2><h2>Missy</h2>'
        })
        .execute('build');
      expect(test.content('dist/statics/app.bundle.js')).to.contain('module.exports = "<h2>Hello</h2><h2>Missy</h2>";');
    });

    it('should provide html file with require image', () => {
      test
        .setup({
          'src/client.js': `require('./template.html')`,
          'src/template.html': '<h2>Hello</h2><img src="./image.gif"/>',
          'src/image.gif': fx.gif()
        })
        .execute('build');
      expect(test.content('dist/statics/app.bundle.js')).to.contain(`"<h2>Hello</h2><img src=\\"" + `);
      expect(test.content('dist/statics/app.bundle.js')).to.contain(`data:image/gif;base64,${fx.gif('base64')}`);
    });
    it('should minimize html', () => {
      test
        .setup({
          'src/client.js': `require('./template.html')`,
          'src/template.html': '<h2>Hello</h2>                <span>world</span>    <p>!</p>',
          'src/image.gif': fx.gif()
        })
        .execute('build');
      expect(test.content('dist/statics/app.bundle.js'))
        .to.contain('<h2>Hello</h2>                <span>world</span>    <p>!</p>');
      expect(test.content('dist/statics/app.bundle.min.js'))
        .to.contain('<h2>Hello</h2> <span>world</span> <p>!</p>');
    });


  });
});
