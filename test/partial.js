// foo
function foo () {
  return baz();
}

function bar () {
  return foo(baz);
}

function baz () {
  return bar();
}

function shouldntChange () {
  return 42;
}
