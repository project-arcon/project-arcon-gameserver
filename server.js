var config = require("./config.json");
var WebSocket = require("ws");
require("./fix");
require("./arcon.js");

const allowedCmds = [
  "gameKey",
  "playerJoin",
  "mouseMove",
  "playerSelected",
  "setRallyPoint",
  "buildRq",
  "stopOrder",
  "holdPositionOrder",
  "followOrder",
  "selfDestructOrder",
  "moveOrder",
  "configGame",
  "startGame",
  "addAi",
  "switchSide",
  "kickPlayer",
  "surrender",
];

global.sim = new Sim();
Sim.prototype.cheatSimInterval = -12;
Sim.prototype.lastSimInterval = 0;

global.Server = function () {
  this.joinList = {};

  var wss = new WebSocket.Server({ port: process.env.PORT || config.port });
  var root = null;
  var players = {};

  this.queued = {};

  var lastInfoTime = 0;
  this.send = (player, data) => {
    let packet = sim.zJson.dumpDv(data);
    let client = player.ws;
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  };

  this.sendToRoot = (data) => {
    root.sendData(data);
  };

  this.stop = () => {
    console.log("stopping server");
    wss.close();
    clearInterval(interval);
  };

  this.say = (msg) => {
    root.sendData([
      "message",
      {
        text: msg,
        channel: config.name,
        color: "FFFFFF",
        name: "Server",
        server: true,
      },
    ]);
  };

  this.executePlayerJoin = (data, ws) => {
    let player = sim.playerJoin(...data);
    player.ws = ws;
    player.isValid = true;
    players[ws.id] = player;
    sim.clearNetState();
  };

  var connectToRoot = () => {
    root = new WebSocket(config.root_addr);

    root.on("open", () => {
      console.log("connected to root");

      root.sendData([
        "server:auth_sign_in",
        {
          email: config.email,
          token: config.token,
        },
      ]);

      sendInfo();
      lastInfoTime = now();
    });

    root.on("authError", (e) => {
      console.log(e);
    });

    root.on("message", (msg) => {
      msg = JSON.parse(msg);
      var type = msg[0];
      var data = msg[1];
      let ws = this.queued[data.gameKey];
      switch (type) {
        case "authError":
          console.log("authError", data);
          break;
        case "login":
          console.log("login", data);
          break;
        case "playerValid":
          if (ws == null) return;
          console.log("playerValid");
          ws.playerJoinData[2] = data.name;
          this.executePlayerJoin(ws.playerJoinData, ws);
          break;
        case "playerInvalid":
          if (ws == null) return;
          console.log("playerInvalid");
          ws.close();
          break;
      }
      delete this.queued[data.gameKey];
    });

    root.on("close", () => {
      console.log("cannot connect to root, retrying");
      setTimeout(connectToRoot, 5000);
    });

    root.on("error", (e) => {
      console.log("connection to root failed");
    });

    root.sendData = (data) => {
      if (root.readyState === WebSocket.OPEN) {
        root.send(JSON.stringify(data));
      }
    };
  };

  var sendInfo = () => {
    // Send server info
    let info = {
      name: config.name,
      address: "ws://" + config.addr + ":" + config.port,
      observers: sim.players.filter((p) => p.connected && !p.ai).length,
      players: sim.players
        .filter((p) => p.connected && !p.ai)
        .map((p) => {
          return {
            name: p.name,
            side: p.side,
            ai: false,
          };
        }),
      type: sim.serverType,
      version: VERSION,
      state: sim.state,
    };
    root.sendData(["server:set_server", info]);
  };

  connectToRoot();

  wss.on("connection", (ws, req) => {
    console.log("connection from", req.connection.remoteAddress);

    let id = req.headers["sec-websocket-key"];
    players[id] = {
      isValid: false,
    };
    ws.on("message", (msg) => {
      try {
        let packet = new DataView(new Uint8Array(msg).buffer);
        let data = sim.zJson.loadDv(packet);
        cmd = data[0];
        if (cmd === "playerJoin") {
          ws.hasPlayerJoinData = true;
          ws.playerJoinData = data;
          ws.id = id;

          if (players[id].isValid) this.executePlayerJoin(data, ws);
        } else if (cmd === "gameKey") {
          if (typeof data[2] !== "string") ws.close();
          console.log(data[1], data[2]);
          ws.gameKey = data[2];
          this.queued[ws.gameKey] = ws;
          root.sendData(["server:check_player", ws.gameKey]);
        } else if (players[id].isValid) {
          if (allowedCmds.includes(data[0])) {
            sim[data[0]].apply(sim, [players[id], ...data.slice(1)]);
          }
        }
      } catch (error) {}
    });

    ws.on("close", (e) => {
      if (players[id]) {
        players[id].connected = false;
        delete players[id];
      }
    });
  });

  var interval = setInterval(() => {
    let rightNow = now();
    if (sim.lastSimInterval + 1000 / 16 + sim.cheatSimInterval <= rightNow) {
      sim.lastSimInterval = rightNow;

      if (!sim.paused) {
        sim.simulate();
      } else {
        sim.startingSim();
      }

      let packet = sim.send();
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(packet);
        }
      });
    }
    if (rightNow - lastInfoTime > 15000) {
      sendInfo();
      lastInfoTime = rightNow;
    }
  }, 17);
};

global.server = new Server();

const originalEndOfGame = Sim.prototype.endOfGame;
Sim.prototype.endOfGame = function () {
  server.root.sendData([
    "game_report",
    {
      winningSide: this.winningSide,
      step: this.step,
      serverType: this.serverType,
      players: this.players.map((player) => ({
        name: player.name,
        color: player.color,
        side: player.side,
        ai: player.ai,
      })),
    },
  ]);

  originalEndOfGame.call(this);
};
