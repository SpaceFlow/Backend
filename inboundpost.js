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


      var sqlAppConnection = mysql.createConnection(JSON.parse(result.Value));
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
                    if (req.body.content == undefined || req.body.content == "") {
                      return res.status(400).json({"contribution_id": 0, "error": "MISSING_CONTENT"});
                    }
                    if (req.body.content.length > 200) {
                      return res.status(400).json({"contribution_id": 0, "error": "CONTENT_TOO_LONG"});
                    }
                    if (req.body.mentioned_users == undefined) {
                        req.body.mentioned_users = "";
                    }
                    var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                    sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                      if (err) throw err;
                      //check scopes
                        if (tokenResults[0] !== undefined) {
                          if (tokenResults[0]["scopes"].split(",").indexOf("post_for_user") !== -1) {
                          var sql = "SELECT app_name FROM oauth_applications WHERE app_id = ?";
                          sqlAppConnection.query(sql, [tokenResults[0]["app_id"]], function (err, applicationResults) {
                            if (err) throw err;
                            if (applicationResults[0] !== undefined) {
                              var sqlInsetValues = {
                                by_user: tokenResults[0]["for_user_id"],
                                content: req.body.content,
                                mentioned_users: req.body.mentioned_users,
                                using_app_id: tokenResults[0]["app_id"]
                              };
                              var sql = "INSERT INTO posts SET ?";
                              sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                                if (err) throw err;
                                res.status(200);
                                res.write(JSON.stringify({
                                  "contribution_id": insertResults.insertId,
                                  "error": null
                                }));
                                res.end();
                              })
                            } else {
                              // app_id not found
                              res.status(400);
                              res.write(JSON.stringify({
                                "contribution_id": null,
                                "error": "APP_ID_NOT_FOUND"
                              }));
                              res.end();
                            }
                          });
                        } else {
                          // token not found
                          res.status(400);
                          res.write(JSON.stringify({
                            "contribution_id": null,
                            "error": "REQUIRED_SCOPE_NOT_SET"
                          }));
                          res.end();
                        }

                      } else {
                        // no permission to create a post with this app_id
                        res.status(400);
                        res.write(JSON.stringify({
                          "contribution_id": null,
                          "error": "TOKEN_NOT_FOUND"
                        }));
                        res.end();
                      }
                    })
                  }
                } else {
                  // Missing OAuth auth header
                  res.status(400);
                  res.write(JSON.stringify({
                    "contribution_id": null,
                    "error": "AUTHENTIFICATION_HEADER_NOT_PRESENT"
                  }));
                  res.end();
                }
              }
          });

          // Bind to a port
          app.listen(3001);
          console.log('Application running!');
        }
    });

    
}
