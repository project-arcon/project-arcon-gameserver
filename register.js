var config_auth = require("./config_auth.json");
var config_network = require("./config_network.json");

if (config_auth.edited === false) {
  console.log("Edit the config_auth.json before run this script.");
  console.log("The edited value must not be false.");
  process.exit(1);
}

if (typeof config_auth.name !== "string" || typeof config_auth.email !== "string" || typeof config_auth.token !== "string") {
  console.log("Edit the config_auth.json before run this script.");
  console.log("The name, email and token value must be string.");
  process.exit(1);
}

const WebSocket = require("ws");
const ws = new WebSocket(config_network.root_addr);

ws.on("open", function open() {
  console.log("Register connected to root.");
  const message = JSON.stringify([
    "server:auth_register",
    {
      name: config_auth.name,
      email: config_auth.email,
      token: config_auth.token,
    },
  ]);
  console.log("Sending auth_register to root.");
  ws.send(message);
});

ws.on("message", function incoming(msg) {
  msg = JSON.parse(msg);
  var type = msg[0];
  var data = msg[1];
  switch (type) {
    case "authError":
      console.log(msg);
      console.log("Regist unsuccessful.");
      process.exit(1);
      break;
    case "login":
      console.log(msg);
      console.log("Regist successes. Your account is available to start the server now.");
      process.exit(0);
      break;
    default:
      break;
  }
});

ws.on("close", () => {
  console.log("Register cannot connect to root.");
  process.exit(1);
});

// Handle any errors that occur
ws.on("error", function error(error) {
  console.error(`WebSocket error: ${error.message}`);
  process.exit(1);
});
