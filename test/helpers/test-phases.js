'use strict';
const _ = require('lodash');
const process = require('process');
const path = require('path');
const sh = require('shelljs');
const spawn = require('child_process').spawn;
const cwd = path.join(__dirname, '..', '..');
const psTree = require('ps-tree');

class Test {
  constructor(script, env) {
    if (typeof script === 'object') {
      env = script;
      script = undefined;
    }

    this.script = script || path.join(cwd, 'wix-node-build.js');
    this.env = Object.assign({}, process.env, env);
    this.child = null;
    this.stdout = '';
    this.stderr = '';
  }

  setup(tree, hooks = []) {
    const tmp = this.tmp = this.tmp || path.join(sh.tempdir().toString(), new Date().getTime().toString());
    const flat = flattenTree(tree);
    Object.keys(flat).forEach(file => {
      this.write(file, flat[file]);
    });
    hooks.forEach(hook => hook(tmp, cwd));
    return this;
  }

  spawn(command, options) {
    if (!this.hasTmp()) {
      throw new Error('Test was not setup');
    }
    if (this.child) {
      throw new Error('Previous child has not teardown');
    }
    try {
      options = options || [];
      options = Array.isArray(options) ? options : options.split(' ');
      // this.child = spawn('node', [`${this.script}`, `${command}`].concat(options), {cwd: this.tmp, stdio: 'inherit'});
      const args = this.args = [`${this.script}`, `${command}`].concat(options);
      const child = this.child = spawn('node', args, {cwd: this.tmp});
      child.stdout.on('data', buffer => {
        this.stdout += buffer.toString();
      });
      child.stderr.on('data', buffer => {
        this.stderr += buffer.toString();
      });

      return child;
    } catch (e) {
      console.log(`Error running ${this.script} ${command}: ${e}`); // TODO: Use logger?
      return null;
    }
  }

  execute(command, options, environment) {
    const args = [command].concat(options);
    const env = Object.assign({}, this.env, environment || {});
    if (this.hasTmp()) {
      this.child = sh.exec(`node "${this.script}" ${args.join(' ')}`, {cwd: this.tmp, env});
      return this.child;
    }
  }

  teardown(keepDir = false) {
    if (!this.hasTmp() || !this.child) {
      return Promise.resolve();
    }
    return this.killSpawnProcessAndHidChildren()
      .then(() => {
        this.child = null;
        this.args = null;
        this.stdout = '';
        this.stderr = '';
        if (!keepDir) {
          sh.rm('-rf', this.tmp);
        }
      });
  }

  hasTmp() {
    return this.tmp && sh.test('-d', this.tmp);
  }

  content(file) {
    return file && sh.cat(path.join(this.tmp, file)).stdout.trim();
  }

  modify(file, arg) {
    if (!arg) {
      sh.touch(path.join(this.tmp, file));
    } else {
      const content = typeof arg === 'function' ? arg(this.content(file)) : arg;
      this.write(file, content);
    }
    return this;
  }

  write(file, content) {
    const fullpath = path.join(this.tmp, file);
    content = content.replace(/'/g, `'\\''`);
    sh.mkdir('-p', path.dirname(fullpath));
    sh.exec(`echo '${content}'`, {silent: true}).to(fullpath);
    return this;
  }

  contains(fileOrDir) {
    const args = arguments.length > 1 ? Array.from(arguments) : [fileOrDir];
    return args.reduce((acc, item) => acc && !!item && sh.test('-e', path.join(this.tmp, item)), true);
  }

  list(dir, options) {
    const loc = path.join(this.tmp, dir || '');
    const args = (options ? [options] : []).concat(loc);
    return Array.from(sh.ls.apply(sh, args));
  }

  killSpawnProcessAndHidChildren() {
    if (!this.child) {
      return Promise.resolve();
    }

    const pid = this.child.pid;
    return psTreePromised(pid)
      .then(children => {
        [pid].concat(children.map(p => p.PID)).forEach(tpid => {
          try {
            process.kill(tpid, 'SIGKILL');
          } catch (e) {
          }
        });
      });
  }

}

function flattenTree(tree, prefix) {
  let result = {};
  prefix = prefix ? prefix + path.sep : '';
  Object.keys(tree).forEach(key => {
    const value = tree[key];
    if (_.isPlainObject(value)) {
      result = Object.assign(result, flattenTree(value, prefix + key));
    } else {
      result[prefix + key] = value;
    }
  });
  return result;
}

function psTreePromised(pid) {
  return new Promise(function (resolve, reject) {
    psTree(pid, (err, children) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(children);
    });
  });
}

module.exports = {
  create: script => new Test(script)
};

/*
const test = module.exports.setup({
  'app/a/a.js': 'const a = 1;',
  test: {
    'a/a.spec.js': '\'use strict\'',
    'b/b.spec.ts': '\'use strict\'',
    'c/c.spec.jsx': '\'use strict\''
  },
  src: {
    b: {
      'b.js': 'const b = 2;'
    },
    'c/c': {
      'c.ts': 'const c = 3;'
    }
  }
});
*/

/*
function parseTree(tree) {
  let result = {};
  Object.keys(tree).forEach(key => {
    let parts = key.split(path.sep);
    const dir = parts.shift();
    const rest = parts.join(path.sep);
    const value = tree[key];
    let branch;
    if (rest) {
      branch = {};
      branch[rest] = value;
    } else {
      branch = value;
    }
    result[dir] = typeof branch === 'string' ? branch : parseTree(branch);
  });
  return result;
}
*/
