var cluster = require('cluster'); // Only required if you want the worker id
var sticky = require('sticky-session');

var server = require('http').createServer(function(req, res) {
  res.end('worker: ' + cluster.worker.id);
});

if (!sticky.listen(server, 3004)) {
  // Master code
  server.once('listening', function() {
    console.log('server started on 3004 port');
  });
} else {
  // Worker code
      console.log("Worker online");
      const EventEmitterClass = require('events');
      const newContributionEmitter = new EventEmitterClass.EventEmitter();
      var consul = require("consul")();
      var mysql = require("mysql");
      var redis = require("redis"),
          redisClient = redis.createClient();

      // get the MySQL Connection Data
      consul.kv.get('database/mysql_app', function(err, result) {
        if (err) throw err;
        if (result == undefined) {
          console.log("Couldn't find the Database KV Key.");
          setTimeout(function() {
            console.log("Retrying...")
            process.exit(1);
          }, 1000)
        } else {

          var io = require('socket.io')(server);
          var sqlAppConnection = mysql.createConnection(JSON.parse(result.Value));
          // Create a new Express application
          io.on('connection', function (socket) {
          	// socket-specific subscribed users list
            var subscribedUsers = [0];

            console.log("New Connection, Worker" + cluster.worker.id);
            socket.on('subscribe', function (data) {
              console.log("Subscribe Trigger");
              var subscribeTo = data.split(",");
              subscribeTo.forEach(function(currentUser) {
                  if (parseInt(currentUser) !== NaN) {
                      subscribedUsers.push(parseInt(currentUser));
                      console.log(cluster.worker.id + " | User subscribed to " + currentUser);
                  }
              })
            });
            socket.on('unsubscribe', function (data) {
               // parse incoming list (?)
               // if no list is provided it will convert the string into an array so the logic below works
               // so fuck off
              var subscribeTo = data.split(",");

              // aaand loop through the generated array, check if is in index and remove the element from subscribed users
              subscribeTo.forEach(function(currentUser) {
                  if (parseInt(currentUser) !== NaN) {
                  	  var index = subscribedUsers.indexOf(currentUser);
                      if (index !== -1) {
                      	subscribedUsers.splice(index, 1);
                      }
                  }
              })
            });


            newContributionEmitter.on('cont', function(contr) {

            	// parsing of contribution emitters
            	// parse json parameters

              contr["using_app"] = JSON.parse(contr["using_app"]);
              contr["by_user"] = JSON.parse(contr["by_user"]);

              // check if the user is subscribed to the user who send the contribution
              if (subscribedUsers.indexOf(parseInt(contr["by_user"]["id"])) !== -1) {
                  // weey, the user is subscribed to the user who send this
                  console.log(cluster.worker.id + " |****Emitting Socket.IO trigger");
                  socket.emit("contribution", JSON.stringify(contr));
              } else {
              	// User not subscribed. Do nothing. furNOPE
              }
            })
          });
          redisClient.monitor(function(err, res) {
              console.log("Started Monitoring");
          })
          redisClient.on("monitor", function(time, args, raw_reply) {
              if (args[0] == "hmset" && args[1].indexOf("cont-") == 0) {
                  var contributionObject = {};
                  // parse array to assoc object
                  for (var i = 2; i < args.length; i = i + 2) {
                      contributionObject[args[i]] = args[i+1];
                  }
                  console.log("Triggering Contribuiton Emitter");
                  newContributionEmitter.emit('cont', contributionObject);
              }
          })
      }
  });
}
