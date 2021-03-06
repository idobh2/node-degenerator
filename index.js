
/**
 * Module dependencies.
 */

var types = require('ast-types');
var esprima = require('esprima');
var escodegen = require('escodegen');

/**
 * Helper functions.
 */

var n = types.namedTypes;
var b = types.builders;

/**
 * Module exports.
 */

module.exports = degenerator;

/**
 * Turns sync JavaScript code into an JavaScript with async Generator Functions.
 *
 * @param {String} jsStr JavaScript string to convert
 * @param {Array} names Array of function names to add `yield` operators to
 * @return {String} Converted JavaScript string with Generator functions injected
 * @api public
 */

function degenerator (jsStr, names) {
  if (!Array.isArray(names)) {
    throw new TypeError('an array of async function "names" is required');
  }

  var ast = esprima.parse(jsStr);

  // duplicate the `names` array since it's rude to augment the user-provided
  // array
  names = names.slice(0);


  // first pass is to find the `function` nodes and turn them into `function *`
  // generator functions only if their body includes CallExpressions to 
  // function in `names`. We also add the names of the functions to the `names` array.
  // We'll iterate several time, as every iteration might add new items to the `names` 
  // array, until no new names we're added in the iteration.
  var lastNamesLength = 0;
  do {
    lastNamesLength = names.length;
    types.visit(ast, {
      visitVariableDeclaration: function (path) {
        if (path.node.declarations) {
          for (var i = 0; i < path.node.declarations.length; i++) {
            var declaration = path.node.declarations[i];
            if (
              declaration.init &&
              declaration.id &&
              'Identifier' == declaration.init.type &&
              'Identifier' == declaration.id.type &&
              checkName(declaration.init.name, names) &&
              !checkName(declaration.id.name, names)
            ) {
              names.push(declaration.id.name);
            }
          }
        }
        return false;
      },
      visitAssignmentExpression: function (path) {
        if (
          path.node.left &&
          path.node.right &&
          'Identifier' == path.node.left.type &&
          'Identifier' == path.node.right.type &&
          checkName(path.node.right.name, names) &&
          !checkName(path.node.left.name, names)
        ) {
          names.push(path.node.left.name);
        }
        return false;
      },
      visitFunction: function (path) {
        if (path.node.id) {
          var shouldDegenerate = false;
          types.visit(path.node, {
            visitCallExpression: function (path) {
              if (checkNames(path.node, names)) {
                shouldDegenerate = true;
              }
              return false;
            }
          });
          if (!shouldDegenerate) {
            return false;
          }
          // got a "function" expression/statement,
          // convert it into a "generator function"
          path.node.generator = true;

          // add function name to `names` array
          if (!checkName(path.node.id.name, names)) {
            names.push(path.node.id.name);
          }
        }

        this.traverse(path);
      }
    });
  } while (lastNamesLength != names.length);

  // second pass is for adding `yield` statements to any function
  // invocations that match the given `names` array.
  types.visit(ast, {
    visitCallExpression: function(path) {
      if (checkNames(path.node, names)) {
        // a "function invocation" expression,
        // we need to inject a `YieldExpression`
        var name = path.name;
        var parent = path.parent.node;

        var delegate = false;
        var expr = b.yieldExpression(path.node, delegate);
        if (parent['arguments']) {
          // parent is a `CallExpression` type
          parent['arguments'][name] = expr;
        } else {
          parent[name] = expr;
        }
      }

      this.traverse(path);
    }
  });

  return escodegen.generate(ast);
}

/**
 * Returns `true` if `node` has a matching name to one of the entries in the
 * `names` array.
 *
 * @param {types.Node} node
 * @param {Array} names Array of function names to return true for
 * @return {Boolean}
 * @api private
 */

function checkNames (node, names) {
  var name;
  var callee = node.callee;
  if ('Identifier' == callee.type) {
    name = callee.name;
  } else if ('MemberExpression' == callee.type) {
    name = callee.object.name + '.' + (callee.property.name || callee.property.raw);
  } else if ('FunctionExpression' == callee.type) {
    if (callee.id) {
      name = callee.id.name;
    } else {
      return false;
    }
  } else {
    throw new Error('don\'t know how to get name for: ' + callee.type);
  }
  return checkName(name, names);
}

function checkName(name, names) {
  // now that we have the `name`, check if any entries match in the `names` array
  var n;
  for (var i = 0; i < names.length; i++) {
    n = names[i];
    if (n.test) {
      // regexp
      if (n.test(name)) return true;
    } else {
      if (name == n) return true;
    }
  }
  return false;
}