function startSection(name) {
  console.log(`---------------${name}---------------`);
}
function endSection(name) {
  console.log(`---------------${name}---------------`);
}
module.exports = function (test) {
  startSection('stdout');
  console.log(test.stdout.trim());
  endSection('stdout');
  startSection('stderr');
  console.log(test.stderr.trim());
  endSection('stderr');
};
