const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
if (cluster.isMaster) {
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function (worker, code, signal)  {
        console.log("worker ${worker.process.pid} died");
        cluster.fork();
    });
} else {
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
        var app = require('express')();
        var server = require('http').Server(app);
        var io = require('socket.io')(server);
        var bodyParser = require("body-parser")
        var sqlAppConnection = mysql.createConnection(JSON.parse(result.Value));
        // Create a new Express application
        app.use(bodyParser.json()); // for parsing application/json
        app.use(bodyParser.urlencoded({ extended: true }));
        io.on('connection', function (socket) {
          var subscribedUsers = [];
          console.log("New Connection, Worker" + cluster.worker.id);
          socket.emit('news', { hello: 'world' });
          socket.on('subscribe', function (data) {
            console.log("Subscribe Trigger");
            var subscribeTo = data.split(",");
            subscribeTo.forEach(function(currentUser) {
                if (parseInt(currentUser) !== NaN) {
                    subscribedUsers.push(currentUser);
                    console.log("User subscribed to " + currentUser);
                }
            })
          });
          newContributionEmitter.on('cont', function(contr) {
            console.log("Recieved Contribuiton Emitter");
            console.log(subscribedUsers.indexOf[parseInt(contr["by_user"])]);
            // check if the user is subscribed to the user who send the contribution
            if (subscribedUsers.indexOf(parseInt(contr["by_user"])) !== -1) {
                // weey, the user is subscribed to the user who send this
                console.log("Emitting Socket.IO trigger");
                socket.emit("contribution", JSON.stringify(contr));
            } else {
                console.log("User not subscribed to this user");
            }
          })
        });
        server.listen(3004);
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