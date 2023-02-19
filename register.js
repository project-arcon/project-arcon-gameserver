var config = require("./config.json");
const WebSocket = require("ws");
const ws = new WebSocket(config.root_addr);
ws.on("open", function open() {
  console.log("connected to root");
  const message = JSON.stringify([
    "server:auth_register",
    {
      name: config.name,
      email: config.email,
      token: config.token,
    },
  ]);
  ws.send(message);
  console.log(`auth_register send`);
});

ws.on("message", function incoming(msg) {
  msg = JSON.parse(msg);
  var type = msg[0];
  var data = msg[1];
  console.log(msg);
  switch (type) {
    case "authError":
      console.error("authError", data);
      break;
    case "login":
      console.log("login", data);
      break;
  }
});

// Handle any errors that occur
ws.on("error", function error(error) {
  console.error(`WebSocket error: ${error.message}`);
});
