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
      var bodyParser = require("body-parser");
          // Create a new Express application
          var app = express();
          app.use(bodyParser.json()); // for parsing application/json
          app.use(bodyParser.urlencoded({ extended: true }));
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
          app.get("/followinfo/self/followers", function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                      if (tokenResults[0] !== undefined) {
                        var limit = 25,
                            offset = 0;
                            order = "DESC"
                            from_user = tokenResults[0]["for_user_id"];
                        if (req.query.limit !== undefined) {
                          var intParsed = parseInt(req.query.limit);
                          if (intParsed !== NaN) {
                            limit = intParsed;
                          }
                        }
                        if (req.query.orderby !== undefined) {
                          newestFirst = (req.query.orderby == "newest") ? "DESC" : "ASC";
                        }
                        if (req.query.offset !== undefined) {
                          var intParsed = parseInt(req.query.offset);
                          if (intParsed !== NaN) {
                            offset = intParsed;
                          }
                        }
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE user IN (SELECT user FROM followings WHERE follows = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", tokenResults[0]["for_user_id"], function(err, starterUserResults) {
                            if (err) throw err;
                            if (starterUserResults[0] !== undefined) {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": followResults
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            }
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
          app.get("/followinfo/:user/followers", function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                      if (tokenResults[0] !== undefined) {
                        var limit = 25,
                            offset = 0;
                            order = "DESC"
                            from_user = req.params.user;
                        if (req.query.limit !== undefined) {
                          var intParsed = parseInt(req.query.limit);
                          if (intParsed !== NaN) {
                            if (limit <= 100) {
                              limit = intParsed;
                            }

                          }
                        }
                        if (req.query.orderby !== undefined) {
                          newestFirst = (req.query.orderby == "newest") ? "DESC" : "ASC";
                        }
                        if (req.query.offset !== undefined) {
                          var intParsed = parseInt(req.query.offset);
                          if (intParsed !== NaN) {
                            offset = intParsed;
                          }
                        }
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE user IN (SELECT user FROM followings WHERE follows = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", for_user_id, function(err, starterUserResults) {
                            if (err) throw err;
                            if (starterUserResults[0] !== undefined) {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": followResults
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            } else {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": []
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            }
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
          app.get("/followinfo/self/followings", function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                      if (tokenResults[0] !== undefined) {
                        var limit = 25,
                            offset = 0;
                            order = "DESC"
                            from_user = tokenResults[0]["for_user_id"];
                        if (req.query.limit !== undefined) {
                          var intParsed = parseInt(req.query.limit);
                          if (intParsed !== NaN) {
                            limit = intParsed;
                          }
                        }
                        if (req.query.orderby !== undefined) {
                          newestFirst = (req.query.orderby == "newest") ? "DESC" : "ASC";
                        }
                        if (req.query.offset !== undefined) {
                          var intParsed = parseInt(req.query.offset);
                          if (intParsed !== NaN) {
                            offset = intParsed;
                          }
                        }
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE follows IN (SELECT follows FROM followings WHERE user = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", tokenResults[0]["for_user_id"], function(err, starterUserResults) {
                            if (err) throw err;
                            if (starterUserResults[0] !== undefined) {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": followResults
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            }
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
          app.get("/followinfo/:user/followings", function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {
                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                      if (tokenResults[0] !== undefined) {
                        var limit = 25,
                            offset = 0;
                            order = "DESC"
                            from_user = req.params.user;
                        if (req.query.limit !== undefined) {
                          var intParsed = parseInt(req.query.limit);
                          if (intParsed !== NaN) {
                            if (limit <= 100) {
                              limit = intParsed;
                            }

                          }
                        }
                        if (req.query.orderby !== undefined) {
                          newestFirst = (req.query.orderby == "newest") ? "DESC" : "ASC";
                        }
                        if (req.query.offset !== undefined) {
                          var intParsed = parseInt(req.query.offset);
                          if (intParsed !== NaN) {
                            offset = intParsed;
                          }
                        }
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE following IN (SELECT follows FROM followings WHERE user = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", for_user_id, function(err, starterUserResults) {
                            if (err) throw err;
                            if (starterUserResults[0] !== undefined) {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": followResults
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            } else {
                              var answerObject = {
                                "type": "follows",
                                "results": limit,
                                "offset": offset,
                                "order": order,
                                "user": starterUserResults[0],
                                "follows": []
                              };
                              res.send(JSON.stringify(answerObject));
                              res.end();
                            }
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
          app.post("/userinformation/self/update", function(req, res) {
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
          app.post("/userinformation/information", function(req, res) {
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
                                sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", tokenResults[0]["for_user_id"], function(err, userResults) {
                                  if (err) throw err;
                                  if (userResults[0] == undefined) {
                                    userResults[0] = {
                                      "username": "unknown",
                                      "screen_name": "Unknown User",
                                      "profile_image_url": "",
                                      "bio": "This user couldn't be found"
                                    }
                                  }
                                  userResults[0]["id"] = tokenResults[0]["for_user_id"];
                                  var contributionObject = {
                                    "repost": false,
                                    "content": req.body.content,
                                    "mentioned_users": req.body.mentioned_users,
                                    "using_app": JSON.stringify({
                                      "id": tokenResults[0]["app_id"], 
                                      "app_name": applicationResults[0]["app_name"]}),
                                    "by_user": JSON.stringify(userResults[0]),
                                    "timestamp": Date.now(),
                                    "contribution_id": insertResults.insertId,
                                    "error": null
                                  };
                                  redisClient.hmset("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject)
                                  redisClient.expire("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                  res.status(200);
                                  res.write(JSON.stringify(contributionObject));
                                  res.end();
                                })
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
          });
          app.post("/contribution/repost", function(req, res) {
                if (req.get("Authorization") !== undefined) {
                  var authHeader = req.get("Authorization").split(" ");
                  if (authHeader[1] !== undefined) {
                    if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {

                      if (req.body.content == undefined || req.body.content == "") {
                        return res.status(400).json({"contribution_id": null, "error": "MISSING_CONTENT"});
                      }
                      if (parseInt(req.body.contribution_id) == NaN) {
                        return res.status(400).json({"contribution_id": null, "error": "CONTENT_TOO_LONG"});
                      }

                      var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                      sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                        if (err) throw err;
                        if (tokenResults[0] !== undefined) {


                          // validate contribution id
                          // request parameters in order to build the streaming response
                          sqlAppConnection.query("SELECT by_user, content, timestamp, mentioned_users, using_app_id FROM posts WHERE id = ? AND repost = 0", [req.body.contribution_id], function(err, contributionResults) {
                            if (err) throw err;


                            // welcome to the SQL hell
                            var sqlInsetValues = {
                              by_user: tokenResults[0]["for_user_id"],
                              content: req.body.contribution_id,
                              using_app_id: tokenResults[0]["app_id"],
                              repost: true
                            };
                            var sql = "INSERT INTO posts SET ?";


                            sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                              if (err) throw err;

                              sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ? AND suspended = 0", [tokenResults[0]["for_user_id"]], function(err, userResults) {
                                if (err) throw err;

                                sqlAppConnection.query("SELECT username, screen_name, profile_image_url, bio FROM accounts WHRE id = ?", contributionResults[0]["by_user"], function(err, repostedUserResults) {
                                if (err) throw err;

                                if (userResults[0] == undefined) {
                                  userResults[0] = {
                                    "username": "unknown",
                                    "screen_name": "Unknown User",
                                    "profile_image_url": "",
                                    "bio": "This user couldn't be found"
                                  }
                                }
                                if (repostedUserResults[0] == undefined) {
                                  repostedUserResults[0] = {
                                    "username": "unknown",
                                    "screen_name": "Unknown User",
                                    "profile_image_url": "",
                                    "bio": "This user couldn't be found"
                                  }
                                }
                                userResults[0]["id"] = tokenResults[0]["for_user_id"];
                                var contributionObject = {
                                  "repost": true,
                                  "content": contributionResults[0].content,
                                  "mentioned_users": contributionResults[0].mentioned_users,
                                  "using_app": JSON.stringify({
                                    "id": tokenResults[0]["app_id"], 
                                    "app_name": applicationResults[0]["app_name"]}),
                                  "by_user": JSON.stringify(repostedUserResults[0]),
                                  "repost_by_user": JSON.stringify(userResults[0]),
                                  "timestamp": contributionResults[0]["timestamp"],
                                  "contribution_id": insertResults.insertId,
                                  "error": null
                                }
                                redisClient.hmset("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject);
                                redisClient.expire("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                res.status(200);
                                  res.write(JSON.stringify(contributionObject));
                                  res.end();
                                });
                              });
                            });
                          });
                        }

                      });
                    }
                  }
                }
              
            

          });

          // Bind to a port
          app.listen(3005);
          console.log('Application running!');
        
    };});}