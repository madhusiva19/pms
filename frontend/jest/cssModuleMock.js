// Stands in for `*.module.css` imports in component tests: returns the
// class name itself for any property access, so `styles.foo` === "foo".
module.exports = new Proxy({}, { get: (_target, prop) => prop });
