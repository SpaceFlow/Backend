/**
 * Created by Kirschn on 24.05.2016.
 */
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
var redis = require("redis"),
    redisClient = redis.createClient();
var realTimeDecayTime = 250;
function getRealTimeDecayTime(timerInterval) {
  setInterval(function() {
      consul.kv.get('realtime/redis_decay_time', function(err, result) {
        if (err) throw err;
        if (result == undefined) {
          console.log("Couldn't find the Realtime Decay KV Key. (realtime/redis_decay_time)");
          setTimeout(function() {
            console.log("Retrying...")
            process.exit(1);
          }, 1000)
        } else {
          realTimeDecayTime = parseInt(result.Value);
        }
        });
  }, timerInterval)
}
if (cluster.isMaster) {
    console.log("Master online");
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
        // Initialize Update Loop
        getRealTimeDecayTime(5000);
      console.log(JSON.parse(result.Value));
      var sqlAppConnection = mysql.createConnection(JSON.parse(result.Value));
      var express = require('express');
          // Create a new Express application
          var app = express();
          app.put('/follow/:user', function (req, res) {
              if (req.get("Authorization") !== undefined && req.params.user !== undefined) {
                if (parseInt(req.params.user) !== NaN) {
                  var authHeader = req.get("Authorization").split(" ");
                  if (authHeader[1] !== undefined) {
                    if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                      var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                      sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                        if (err) throw err;
                        //check scopes
                          if (tokenResults[0] !== undefined) {
                            if (tokenResults[0]["scopes"].split(",").indexOf("follow_from_user") !== -1) {
                            var sql = "SELECT app_name FROM oauth_applications WHERE app_id = ?";
                            sqlAppConnection.query(sql, [tokenResults[0]["app_id"]], function (err, applicationResults) {
                              if (err) throw err;
                              if (applicationResults[0] !== undefined) {
                                var sqlInsetValues = {
                                  user: tokenResults[0]["for_user_id"],
                                  follows: req.params.user
                                };
                                var sql = "INSERT INTO follows SET ?";
                                sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                                  if (err) throw err;
                                  sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", req.params.user, function(err, starterUserResults) {
                                    if (err) throw err;
                                  sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", tokenResults[0]["for_user_id"], function(err, targetUserResults) {
                                    if (err) throw err;
                                    if (starterUserResults[0] == undefined) {
                                      starterUserResults[0] = {
                                        "username": "unknown",
                                        "screen_name": "Unknown User",
                                        "profile_image_url": "",
                                        "bio": "This user couldn't be found"
                                      }
                                    }
                                    if (targetUserResults[0] == undefined) {
                                      targetUserResults[0] = {
                                        "username": "unknown",
                                        "screen_name": "Unknown User",
                                        "profile_image_url": "",
                                        "bio": "This user couldn't be found"
                                      }
                                    }
                                    targetUserResults[0]["id"] = tokenResults[0]["for_user_id"];
                                    starterUserResults[0]["id"] = req.params.user;
                                    var contributionObject = {
                                      "unfollow": false,
                                      "starter_user": JSON.stringify(starterUserResults[0]),
                                      "using_app": JSON.stringify({
                                        "id": tokenResults[0]["app_id"], 
                                        "app_name": applicationResults[0]["app_name"]}),
                                      "target_user": JSON.stringify(targetUserResults[0]),
                                      "timestamp": Date.now(),
                                      "error": null
                                    };
                                    redisClient.hmset("follow-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject)
                                    redisClient.expire("follow-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                    res.status(200);
                                    res.write(JSON.stringify(contributionObject));
                                    res.end();
                                  })
                                });
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
                      "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
                }
                
              }
          });
          app.put('/unfollow/:user', function (req, res) {
              if (req.get("Authorization") !== undefined && req.params.user !== undefined) {
                if (parseInt(req.params.user) !== NaN) {
                  var authHeader = req.get("Authorization").split(" ");
                  if (authHeader[1] !== undefined) {
                    if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                      var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                      sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                        if (err) throw err;
                        //check scopes
                          if (tokenResults[0] !== undefined) {
                            if (tokenResults[0]["scopes"].split(",").indexOf("follow_from_user") !== -1) {
                            var sql = "SELECT app_name FROM oauth_applications WHERE app_id = ?";
                            sqlAppConnection.query(sql, [tokenResults[0]["app_id"]], function (err, applicationResults) {
                              if (err) throw err;
                              if (applicationResults[0] !== undefined) {
                                var sqlInsetValues = {
                                  user: tokenResults[0]["for_user_id"],
                                  follows: req.params.user
                                };
                                var sql = "DELETE FROM users WHERE ?";
                                sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                                  if (err) throw err;
                                  sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", req.params.user, function(err, starterUserResults) {
                                    if (err) throw err;
                                  sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", tokenResults[0]["for_user_id"], function(err, targetUserResults) {
                                    if (err) throw err;
                                    if (starterUserResults[0] == undefined) {
                                      starterUserResults[0] = {
                                        "username": "unknown",
                                        "screen_name": "Unknown User",
                                        "profile_image_url": "",
                                        "bio": "This user couldn't be found"
                                      }
                                    }
                                    if (targetUserResults[0] == undefined) {
                                      targetUserResults[0] = {
                                        "username": "unknown",
                                        "screen_name": "Unknown User",
                                        "profile_image_url": "",
                                        "bio": "This user couldn't be found"
                                      }
                                    }
                                    targetUserResults[0]["id"] = tokenResults[0]["for_user_id"];
                                    starterUserResults[0]["id"] = req.params.user;
                                    var contributionObject = {
                                      "unfollow": true,
                                      "starter_user": JSON.stringify(starterUserResults[0]),
                                      "using_app": JSON.stringify({
                                        "id": tokenResults[0]["app_id"], 
                                        "app_name": applicationResults[0]["app_name"]}),
                                      "target_user": JSON.stringify(targetUserResults[0]),
                                      "timestamp": Date.now(),
                                      "error": null
                                    };
                                    redisClient.hmset("follow-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject)
                                    redisClient.expire("follow-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                    res.status(200);
                                    res.write(JSON.stringify(contributionObject));
                                    res.end();
                                  })
                                });
                                  });
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
                      "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
                }
                
              }
          });

          // Bind to a port
          app.listen(3005);
          console.log('Application running!');
        
    };});}