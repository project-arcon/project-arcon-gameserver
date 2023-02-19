(function() {
  var libs = [
    "./src/mtwist.js",
    "./src/maths.js",
    "./src/hspace.js",
    "./src/zjson.js",
    "./src/protocol.js",
    "./src/utils.js",
    "./src/colors.js",
    "./src/maps.js",
    "./src/sim.js",
    "./src/survival.js",
    //"./src/interpolator.js",
    "./src/things.js",
    "./src/unit.js",
    "./src/parts.js",
    "./src/ai.js",
    //"./src/aidata.js",
    "./src/grid.js"
  ];
  libs.forEach(key => {
    delete require.cache[require.resolve(key)];
  });
  libs.forEach(key => {
    require(key);
  });
}).call(this);
