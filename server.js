var config_network = require("./config_network.json");
var config_auth = require("./config_auth.json");
var WebSocket = require("ws");
require("./fix");
require("./main-arcon.js");

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

global.sim = null;
//Sim.prototype.cheatSimInterval = -12;
Sim.prototype.lastSimInterval = 0;
Sim.prototype.tickRate = 16;
Sim.prototype.simTouched = false;
Sim.prototype.sendGameReport = function () {
  if (this.serverType == "sandbox" && this.step < 960) {
    return;
  }
  let players = sim.players
    .filter((p) => p.side !== "spectators")
    .map((p) => {
      return {
        name: p.name,
        color: p.color,
        side: p.side,
        ai: p.ai,
      };
    });
  server.sendToRoot([
    "server:game_report",
    {
      ending_method: "unknow",
      winning_side: this.winningSide,
      ranked: ["1v1r", "1v1t"].includes(this.serverType),
      step: this.step,
      realtime: this.step / 16.0,
      mode: this.serverType,
      map_seed: this.mapSeed,
      players: players,
    },
  ]);
};
global.genSim = function () {
  sim = new Sim();
};
genSim();

var root = null;

global.Server = function () {
  var wss = new WebSocket.Server({ port: process.env.PORT || config_network.port });
  var players = {};
  this.queued = {};

  var lastInfoTime = 0;

  this.regenSim = function () {
    genSim();
    var anyJoined = false;
    var touched = false;
    for (var id in players) {
      var oldPlayer = players[id];
      if (oldPlayer.connected && oldPlayer.ws) {
        var oldPlayerData = oldPlayer.playerJoinData;
        var oldWs = oldPlayer.ws;
        var oldAfk = oldPlayer.afk;
        var oldActive = oldPlayer.lastActiveTime;
  
        var player = sim.playerJoin(...oldPlayerData);
        player.playerJoinData = oldPlayerData;
        player.ws = oldWs;
        player.afk = oldAfk;
        player.lastActiveTime = oldActive;
        //ws.playerId = id;
        players[id] = player;
  
        anyJoined = true;
        if (!oldAfk) {
          touched = true;
        }
      }
    }
    if (anyJoined) {
      sim.clearNetState();
    }
    if (touched) {
      sim.touch();
    }
  };

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
    this.sendToRoot([
      "server:message",
      {
        text: msg,
        channel: config_auth.name,
        color: "FFFFFF",
        name: "Server",
        server: true,
      },
    ]);
  };

  this.executePlayerJoin = (data, ws) => {
    let player = sim.playerJoin(...data);
    player.playerJoinData = data;
    player.ws = ws;
    player.isValid = true;
    players[ws.id] = player;
    sim.clearNetState();
  };

  var connectToRoot = () => {
    root = new WebSocket(config_network.root_addr);

    root.on("open", () => {
      console.log("connected to root");

      this.sendToRoot([
        "server:auth_sign_in",
        {
          email: config_auth.email,
          token: config_auth.token,
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
      name: config_auth.name,
      address: "ws://" + config_network.addr + ":" + config_network.port,
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
    this.sendToRoot(["server:set_server", info]);
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
          this.sendToRoot(["server:check_player", ws.gameKey]);
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
    try {
      let rightNow = now();
      var simTimeDiff = rightNow - (sim.lastSimInterval + 1000 / sim.tickRate);
      if (simTimeDiff >= 0) {
        sim.lastSimInterval = rightNow - Math.min(1000, simTimeDiff);
        if (simTimeDiff >= 1000 && rightNow - sim.accuLastSimInterval >= Math.max(1000 / sim.tickRate, 1000 / 16) * 2 && sim.lastCantKeepUp <= rightNow) {
          sim.lastCantKeepUp = rightNow + 15000;
          sim.sayToServer("server.cant_keep_up", Math.ceil(simTimeDiff));
        }
        sim.accuLastSimInterval = rightNow;
        if (!sim.paused || !sim.simTouched) {
          sim.simulate();
        } else {
          sim.startingSim();
        }
        try {
          let packet = sim.send();
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(packet);
            }
          });
        } catch (e) {
          sim.sayToServer("server.crash.type.send");
          throw e;
        }
      }
      if (sim.shouldBeDestroyed()) {
        console.log("no players connected, destroying sim");
        this.regenSim();
      }
      if (rightNow - lastInfoTime > 15000) {
        sendInfo();
        lastInfoTime = rightNow;
      }
    } catch (e) {
      console.error(e);
      sim.sayToServer("server.crash.type.sim");
      sim.sayToServer("server.crash.restart_sim");
      if (sim.state === "running") {
        sim.winningSide = "server crashed";
        sim.sendGameReport();
      }
      this.regenSim();
      //throw error;
    }
  }, 17);
};

global.server = new Server();
