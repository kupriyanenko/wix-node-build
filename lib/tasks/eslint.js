'use strict';

const globs = require('../globs');

module.exports = (gulp, plugins, options) =>
  gulp.task('eslint', () => {
    plugins.util.log('Linting with ESLint');

    const files = options.dirs ?
        options.dirs :
        globs.eslint();

    return gulp.src(files)
      .pipe(plugins.eslint())
      .pipe(plugins.eslint.format())
      .pipe(plugins.eslint.failAfterError());
  });
