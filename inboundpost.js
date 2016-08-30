/**
 * Created by Kirschn on 24.05.2016.
 */
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
    var consul = require("consul")();
    var mysql = require("mysql");
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


      var sqlAppConnection = mysql.createConnection(result.Value);
      var express = require('express');
      var bodyParser = require("body-parser")
          // Create a new Express application
          var app = express();
          app.use(bodyParser.json()); // for parsing application/json
          app.use(bodyParser.urlencoded({ extended: true }));
          // Add a basic route – index page
          app.post('/contribution', function (req, res) {
              if (req.get("Authorization") !== undefined) {
                var authHeader = req.get("Authorization").split(" ");
                if (authHeader[1] !== undefined) {
                  if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                    let sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  }
                } else {
                  // No OAuth auth header
                }
              }
          });

          // Bind to a port
          app.listen(3001);
          console.log('Application running!');
        }
    });

    
}
