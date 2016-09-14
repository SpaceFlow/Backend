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


      var sqlAppConnection = mysql.createConnection(JSON.parse(result.Value));
      var express = require('express');
      var bodyParser = require("body-parser")
          // Create a new Express application
          var app = express();
          app.use(bodyParser.json()); // for parsing application/json
          app.use(bodyParser.urlencoded({ extended: true }));
          app.post("/user/self/update", function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                    if (tokenResults[0]["scopes"].split(",").indexOf("update_user_information") == -1) {
                      return res.status(200).json({"error": "REQUIRED_SCOPE_NOT_SET","updated": null});
                    }
                    //check scopes
                      if (tokenResults[0] !== undefined) {
                        var updateValues = {}
                        if (req.body.bio !== undefined) {
                          // Update Bio
                          updateValues.bio = req.body.bio;
                        }
                        if (req.body.screen_name !== undefined) {
                          // Update Screen name
                          updateValues.screen_name = req.body.screen_name;
                        }
                        if (req.body.profile_image_url !== undefined) {
                          // Update Profile Image URL
                          updateValues.profile_image_url = req.body.profile_image_url;
                        }
                        var sql = "UPDATE accounts SET ? WHERE id=" + mysql.escape(tokenResults[0]["for_user_id"]);
                        sqlAppConnection.query(sql, updateValues, function(err, results) {
                          if (err) throw err;
                          // Update successful
                          res.status(200).json({
                            "error": null,
                            "updated": updateValues
                          });

                        })
                      } else {
                        res.status(200).json({
                            "error": "TOKEN_NOT_FOUND",
                            "updated": null
                          });
                      }
                    });
                }
              }
            }
          });
          app.post("/user/information", function(req, res) {
            if (req.body.user_id !== undefined) {
              var sql = "SELECT id, username, screen_name, profile_image_url, bio, suspended FROM accounts WHERE id = ?";
              var getquery = sqlAppConnection.query(sql, req.body.user_id, function(err, results) {
                if (err) throw err;
                if (results[0] == undefined) {
                  return res.json({"error": "USER_ID_NOT_FOUND", "results": null}).end();
                }
                res.json({"error": null, "results": results[0]});
                res.end();
              })
            }
          });
          app.listen(3003);
      };
      })
    }