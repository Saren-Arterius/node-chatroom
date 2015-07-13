var http = require('http');
var fs = require('fs');
var path = require('path');
var io = require('socket.io');
var exec = require('child_process').exec;


var BIND_ADDRESS = process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0";
var SERVER_PORT = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 8001;

var SAVE_MIN_INTERVAL = 5 * 1000;
var chatsLastSecond = 0;

var MAX_CHATS = 100;
var lastSaveChats = 0;
var chatsFilename = path.join(__dirname, "chats.json");

var saveChats = function() {
  if (Date.now() - lastSaveChats < SAVE_MIN_INTERVAL) {
    return;
  }
  lastSaveChats = Date.now();
  var start = chats.length - MAX_CHATS;
  start = start < 0 ? 0 : start;
  chats = chats.slice(start, chats.length)
  fs.writeFile(chatsFilename, JSON.stringify(chats), function(err) {
    if (err) {
      return console.log(err);
    }
    console.log("Chats was saved!");
  })
};

try {
  var chats = JSON.parse(fs.readFileSync(chatsFilename));
} catch (e) {
  var chats = [];
} finally {
  saveChats();
}

var lastSaveRankings = 0;
var rankingsFilename = path.join(__dirname, "rankings.json");
var saveRankings = function() {
  if (Date.now() - lastSaveRankings < SAVE_MIN_INTERVAL) {
    return;
  }
  lastSaveRankings = Date.now();
  fs.writeFile(rankingsFilename, JSON.stringify(rankings), function(err) {
    if (err) {
      return console.log(err);
    }
    console.log("Rankings was saved!");
  })
};

try {
  var rankings = JSON.parse(fs.readFileSync(rankingsFilename));
} catch (e) {
  var rankings = {
    "totals": {},
    "max_cpss": {}
  };
} finally {
  saveRankings();
}

var playerCPSs = {};

var server = http.createServer(function(request, response) {
  var filename;
  if (request.url == "/") {
    filename = path.join(__dirname, "assets", "index.html");
  } else {
    filename = path.join(__dirname, "assets", request.url);
  }

  fs.readFile(filename, function(error, contents) {
    if (error) {
      response.writeHead(404, {
        'Content-Type': 'text/html'
      });
      response.end("Not found.");
      return;
    }
    var cType = path.extname(request.url);
    if (cType.length == 0) {
      cType = "html";
    } else {
      cType = cType.substr(1);
    }
    response.writeHead(200, {
      'Content-Type': 'text/' + cType
    });
    response.end(contents);
  });
});


server.listen(SERVER_PORT);
var ioServer = io.listen(server);

function findClientsSocket(roomId, namespace) {
  var res = [];
  var ns = ioServer.of(namespace || "/"); // the default namespace is "/"

  if (ns) {
    for (var id in ns.connected) {
      if (roomId) {
        var index = ns.connected[id].rooms.indexOf(roomId);
        if (index !== -1) {
          res.push(ns.connected[id]);
        }
      } else {
        res.push(ns.connected[id]);
      }
    }
  }
  return res;
}


function bySortedValue(obj, callback, context) {
  var tuples = [];

  for (var key in obj) tuples.push([key, obj[key]]);

  tuples.sort(function(a, b) {
    return a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0
  });

  callback.call(context, tuples);
}

function sendStatus(socket) {
    var sockets = findClientsSocket();
    for (var ip in playerCPSs) {
      if (!rankings["max_cpss"][ip] || playerCPSs[ip] > rankings["max_cpss"][ip]) {
        rankings["max_cpss"][ip] = playerCPSs[ip];
      }
    }
    playerCPSs = {};

    var maxCPSsArray;
    var totalsArray;

    bySortedValue(rankings["max_cpss"], function(tuples) {
      var end = 10;
      end = end > tuples.length ? tuples.length : end;
      maxCPSsArray = tuples.slice(0, end);
    });

    bySortedValue(rankings["totals"], function(tuples) {
      var end = 10;
      end = end > tuples.length ? tuples.length : end;
      totalsArray = tuples.slice(0, end);
    });

    exec("cat /proc/loadavg |  awk '{print $1}'", function(error, stdout, stderr) {
      var status = {
        'online': sockets.length,
        'cps': chatsLastSecond,
        'system_load': stdout,
        'max_cpss': maxCPSsArray,
        'totals': totalsArray
      };
      if (socket) {
        socket.emit('status', status);
      } else {
        for (var i in sockets) {
          sockets[i].emit('status', status);
        }
      }
      chatsLastSecond = 0;
    });
    saveRankings();
}

setInterval(sendStatus, 1000);

ioServer.sockets.on('connection', function(socket) {
  var clientIp = socket.request.connection.remoteAddress || socket.handshake.headers['x-real-ip'];
  console.log("New connection from " + clientIp);
  var noIPChats = [];
  for (var i in chats) {
    var noIPChat = {};
    noIPChat["name"] = chats[i]["name"];
    noIPChat["message"] = chats[i]["message"];
    noIPChat["timestamp"] = chats[i]["timestamp"];
    noIPChats.push(noIPChat);
  }
  socket.emit('existing-chats', noIPChats);
  sendStatus(null);

  socket.on('new-message', function(newMessage) {
    if (newMessage["name"].length == 0 || newMessage["message"].length == 0) {
      return;
    }
    if (newMessage["name"].length > 16 || newMessage["message"].length > 140) {
      return;
    }
    chatsLastSecond++;
    newMessage["timestamp"] = Date.now();
    var sockets = findClientsSocket();
    for (var i in sockets) {
      sockets[i].emit('incoming-chat', newMessage);
    }
    if (!playerCPSs[clientIp]) {
      playerCPSs[clientIp] = 1;
    } else {
      playerCPSs[clientIp]++;
    }
    if (!rankings["totals"][clientIp]) {
      rankings["totals"][clientIp] = 1;
    } else {
      rankings["totals"][clientIp]++;
    }
    console.log(playerCPSs);
    chats.push(newMessage);
    newMessage["ip_address"] = clientIp;
    saveChats();
  });
});
