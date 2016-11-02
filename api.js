/**
 * Created by Kirschn on 24.05.2016.
 */
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
var redis = require("redis"),
    redisClient = redis.createClient();
var realTimeDecayTime = 250;
var requestPrefix = "v1";
var databaseGetters = require("./database_getters.js");
databaseGetters.setRedis(redisClient);
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
          // Add headers
          app.use(function (req, res, next) {

              // Website you wish to allow to connect
              res.setHeader('Access-Control-Allow-Origin', '*');

              // Request methods you wish to allow
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

              // Request headers you wish to allow
              res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');

              // Set to true if you need the website to include cookies in the requests sent
              // to the API (e.g. in case you use sessions)
              res.setHeader('Access-Control-Allow-Credentials', true);

              // Pass to next layer of middleware
              next();
          });
          app.put('/' + requestPrefix + 'follow/:user', function (req, res) {
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
                                  databaseGetters.userFromID(sqlAppConnection, req.params.user, function(err, starterUserResults) {
                                    if (err) throw err;
                                  databaseGetters.userFromID(sqlAppConnection, tokenResults[0]["for_user_id"], function(err, targetUserResults) {
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
          app.put('/' + requestPrefix + 'unfollow/:user', function (req, res) {
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
                                  databaseGetters.userFromID(sqlAppConnection, req.params.user, function(err, starterUserResults) {
                                    if (err) throw err;
                                  databaseGetters.userFromID(sqlAppConnection, tokenResults[0]["for_user_id"], function(err, targetUserResults) {
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
          app.get("/" + requestPrefix + "/followinfo/:user/followers", function(req, res) {
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
                            order = "DESC";
                        if (parseInt(req.params.user) == NaN) {
                          from_user = parseInt(tokenResults[0]["for_user_id"]);
                        } else {
                          from_user = parseInt(req.params.user);
                        }
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
                        var sql = "SELECT accounts.id, accounts.username, accounts.screen_name, accounts.profile_image_url, accounts.bio FROM accounts WHERE id IN (SELECT user AS id FROM followings WHERE followings.follows = ?) AND suspended = 0 LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset);
                        //var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE user IN (SELECT user FROM followings WHERE follows = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          databaseGetters.userFromID(sqlAppConnection, for_user_id, function(err, starterUserResults) {
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
          app.get("/" + requestPrefix + "/followinfo/:user/followings", function(req, res) {
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
                            newestFirst = "DESC";
                            if (parseInt(req.params.user) == NaN) {
                              from_user = parseInt(tokenResults[0]["for_user_id"]);
                            } else {
                              from_user = parseInt(req.params.user);
                            }
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
                        var sql = "SELECT accounts.id, accounts.username, accounts.screen_name, accounts.profile_image_url, accounts.bio FROM accounts WHERE id IN (SELECT follows AS id FROM followings WHERE followings.user = ?) AND suspended = 0 LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset);
                        //var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE following IN (SELECT follows FROM followings WHERE user = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst + " ) AND suspended = 0";
                        sqlAppConnection.query(sql, from_user, function (err, followResults) {
                          if (err) throw err;
                          databaseGetters.userFromID(sqlAppConnection, for_user_id, function(err, starterUserResults) {
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
                        res.status(400).json({
                            "error": "TOKEN_NOT_FOUND",
                            "updated": null
                          });
                      }
                    });
                }
              }
            }
          });
          app.post("/" + requestPrefix + "/userinformation/self/update", function(req, res) {
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
                        res.status(400).json({
                            "error": "TOKEN_NOT_FOUND",
                            "updated": null
                          });
                      }
                    });
                }
              }
            }
          });
          app.get("/" + requestPrefix + "/user/:userid", function(req, res) {
            if (req.params.userid !== undefined) {
              databaseGetters.userFromID(sqlAppConnection, req.params.userid, function(err, results) {
                if (err) throw err;
                if (results[0] == undefined) {
                  return res.json({"error": "USER_ID_NOT_FOUND", "results": null}).end();
                }
                res.json({"error": null, "results": results[0]});
                res.end();
              })
            } else {
              res.status(400).json({"error": "USER_ID_NOT_FOUND", "results": null}).end();
            }
          });
          app.post('/' + requestPrefix + 'contribution', function (req, res) {
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
                                databaseGetters.userFromID(sqlAppConnection, tokenResults[0]["for_user_id"], function(err, userResults) {
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
          app.put("/" + requestPrefix + "/contribution/repost/:contribution_id", function(req, res) {
                if (req.get("Authorization") !== undefined) {
                  var authHeader = req.get("Authorization").split(" ");
                  if (authHeader[1] !== undefined) {
                    if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {

                      if (req.params.contribution_id == undefined || req.params.contribution_id == "") {
                        return res.status(400).json({"contribution_id": null, "error": "CONTRIBUTION_ID_NOT_SET"});
                      }
                      if (parseInt(req.params.contribution_id) == NaN) {
                        return res.status(400).json({"contribution_id": null, "error": "INVALID_CONTRIBUTION_ID"});
                      }

                      var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                      sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                        if (err) throw err;
                        if (tokenResults[0] !== undefined) {
                          if (tokenResults[0]["scopes"].split(",").indexOf("post_for_user")) {

                            // validate contribution id
                            // request parameters in order to build the streaming response
                            sqlAppConnection.query(databaseGetters.contribInformationQuery, [req.params.contribution_id], function(err, contributionResults) {

                              if (err) throw err;
                              if (contributionResults[0] == undefined) {
                                return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND"}).end();
                              }

                              // welcome to the SQL hell
                              
                              var sql = "INSERT INTO posts SET ?";
                              // uh we just reposted a repost - 
                              if (contibutionResults[0].repost == true) {
                                // reposted repost! fetch original information, then insert this into the database
                                sqlAppConnection.query(databaseGetters.contribInformationQuery, contributionResults[0].content, function(err, originalContributionResults) {
                                  if (err) throw err;
                                  if (originalContributionResults[0] == undefined) {
                                    return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND"}).end();     
                                  }

                                  var sqlInsetValues = {
                                    by_user: tokenResults[0]["for_user_id"],
                                    content: originalContributionResults[0].id,
                                    using_app_id: tokenResults[0]["app_id"],
                                    repost: true
                                  };
                                  sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                                    if (err) throw err;

                                    databaseGetters.userFromID(sqlAppConnection, [tokenResults[0]["for_user_id"]], function(err, userResults) {
                                      if (err) throw err;

                                      databaseGetters.userFromID(sqlAppConnection, originalContributionResults[0]["by_user"], function(err, repostedUserResults) {
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
                                      // since this contrib was just created there are no stats, so we can just hardcode 0 into this
                                      var contributionObject = {
                                        "repost": true,
                                        "content": originalContributionResults[0].content,
                                        "mentioned_users": originalContributionResults[0].mentioned_users,
                                        "using_app": JSON.stringify({
                                          "id": tokenResults[0]["app_id"], 
                                          "app_name": applicationResults[0]["app_name"]}),
                                        "by_user": JSON.stringify(repostedUserResults[0]),
                                        "repost_by_user": JSON.stringify(userResults[0]),
                                        "timestamp": originalContributionResults[0]["timestamp"],
                                        "stats": JSON.stringify({
                                          "reposts": originalContributionResults[0].reposts + 1,
                                          "favs": originalContributionResults[0].favs
                                        }),
                                        "repost_contribution_id": insertResults.insertId,
                                        "contribution_id": originalContributionResults[0].id
                                        "error": null
                                      }
                                      // update repost count
                                      sqlAppConnection.query("UPDATE posts SET reposts = reposts + 1 WHERE id = ? OR id = ?", [originalContributionResults[0].id, insertResults.insertId]);
                                      redisClient.hmset("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject);
                                      redisClient.expire("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                      res.status(200);
                                        res.write(JSON.stringify(contributionObject));
                                        res.end();
                                      });
                                    });
                                  });

                                });
                              } else {
                                // reposted original post
                                var sqlInsetValues = {
                                  by_user: tokenResults[0]["for_user_id"],
                                  content: req.params.contribution_id,
                                  using_app_id: tokenResults[0]["app_id"],
                                  repost: true
                                };
                                sqlAppConnection.query(sql, sqlInsetValues, function (err, insertResults) {
                                  if (err) throw err;

                                  databaseGetters.userFromID(sqlAppConnection, [tokenResults[0]["for_user_id"]], function(err, userResults) {
                                    if (err) throw err;

                                    databaseGetters.userFromID(sqlAppConnection, contributionResults[0]["by_user"], function(err, repostedUserResults) {
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
                                    // since this contrib was just created there are no stats, so we can just hardcode 0 into this
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
                                      "stats": JSON.stringify({
                                        "reposts": contributionResults[0].reposts + 1,
                                        "favs": contributionResults[0].favs
                                      }),
                                      "repost_contribution_id": insertResults.insertId,
                                      "contribution_id": contributionResults[0].id
                                      "error": null
                                    }
                                    redisClient.hmset("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], contributionObject);
                                    redisClient.expire("cont-" + insertResults.insertId + "-" + tokenResults[0]["for_user_id"], realTimeDecayTime);
                                    res.status(200);
                                      res.write(JSON.stringify(contributionObject));
                                      res.end();
                                    });
                                    // update repost count
                                    sqlAppConnection.query("UPDATE posts SET reposts = reposts + 1 WHERE id = ?", contributionResults[0].id);
                                  });
                                });
                              }

                              
                            });
                          }
                        }

                      });
                    }
                  }
                }
              
            

          });



          app.get("/" + requestPrefix + "/contribution/:id", function(req, res) {

            // check params

            if (req.params.id == undefined) {
              return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND", "contribution": null}).end();
            }
            if (parseInt(req.params.id) == NaN) {
              return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND", "contribution": null}).end();
            }

            // sql query
            var sql = databaseGetters.contribInformationQuery;
            sqlAppConnection.query(sql, req.params.id, function(err, results) {
              if (err) throw err;


              //contribution?
              if (results[0] == undefined) {
                  return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND", "contribution": null}).end();
              }
              if (results[0].repost == true) {
                sqlAppConnection.query(sql, results[0].content, function (err, repostQueryResults) {
                  if (err) throw err;
                  if (repostsQueryResults[0] == undefined) {
                    return res.status(404).json({"error": "CONTRIBUTION_NOT_FOUND", "contribution": null}).end();
                  }
                  // wow, build up the object and send it!

                  results[0]["id"] = parseInt(req.params.id);
                  repostQueryResults[0].repost_information = results[0];
                  res.status(200).json({
                    "error": null,
                    "status": repostQueryResults[0]
                  }).end();

                })
              } else {
                // wow, build up the object and send it!
                results[0]["id"] = parseInt(req.params.id);
                res.status(200).json({
                  "error": null,
                  "status": results[0]
                }).end();
              }

            });

          })
          app.get('/' + requestPrefix + 'contributions/timeline', function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {


                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                    if (tokenResults[0] == undefined) {
                      // lol fuck this shit i'm outta here
                      return res.status(400).json({
                        "error": "TOKEN_NOT_FOUND",
                        "contributions": null
                      }).end();

                    }


                    var limit = 100,
                        offset = 0;
                    if (req.query.limit !== undefined) {
                      var intParsed = parseInt(req.query.limit);
                      if (intParsed !== NaN) {
                        if (limit <= 100) {
                          limit = intParsed;
                        }

                      }
                    }



                    if (req.query.offset !== undefined) {
                      var intParsed = parseInt(req.query.offset);
                      if (intParsed !== NaN) {
                        offset = intParsed;
                      }
                    }



                    var sql = "SELECT posts.by_user, posts.content, posts.timestamp, posts.mentioned_users, accounts.id AS userid, accounts.screen_name, accounts.bio, accounts.profile_image_url FROM posts, accounts WHERE posts.by_user IN (SELECT follows AS id FROM followings WHERE followings.user = ?) AND posts.by_user = accounts.id AND accounts.suspended = 0 ORDER BY posts.timestamp DESC LIMIT " + mysql.escape(limit) + ", " + mysql.escape(offset);
                    sqlAppConnection.query(sql, tokenResults[0].for_user_id, function(err, results) {
                      if (err) throw err;
                      res.status(200).json({
                        "error": null,
                        "contributions": results
                      })
                    })




                  });
                }  else {
                    res.status(400);
                    res.write(JSON.stringify({
                       "contributions": null,
                       "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
                } else {
                    res.status(400);
                    res.write(JSON.stringify({
                       "contributions": null,
                       "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
              } else {
                res.status(400);
                  res.write(JSON.stringify({
                    "contributions": null,
                    "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                  }));
                  res.end();
                }
              
            }
          )
          app.get('/' + requestPrefix + 'contributions/:user', function(req, res) {
            if (req.get("Authorization") !== undefined) {
              var authHeader = req.get("Authorization").split(" ");
              if (authHeader[1] !== undefined) {
                if (authHeader[1].length == 64 && authHeader[0] == "OAuth") {


                  var sql = "SELECT app_id, for_user_id, scopes FROM oauth_tokens WHERE token = ?";
                  sqlAppConnection.query(sql, [authHeader[1]], function (err, tokenResults) {
                    if (err) throw err;
                    if (tokenResults[0] == undefined) {
                      // lol fuck this shit i'm outta here
                      return res.status(400).json({
                        "error": "TOKEN_NOT_FOUND",
                        "contributions": null
                      }).end();

                    }


                    var limit = 100,
                        offset = 0;
                    if (req.query.limit !== undefined) {
                      var intParsed = parseInt(req.query.limit);
                      if (intParsed !== NaN) {
                        if (limit <= 100) {
                          limit = intParsed;
                        }

                      }
                    }



                    if (req.query.offset !== undefined) {
                      var intParsed = parseInt(req.query.offset);
                      if (intParsed !== NaN) {
                        offset = intParsed;
                      }
                    }



                    var sql = "SELECT posts.by_user, posts.content, posts.timestamp, posts.mentioned_users, accounts.id AS userid, accounts.screen_name, accounts.bio, accounts.profile_image_url FROM posts, accounts WHERE posts.by_user = ? AND posts.by_user = accounts.id AND accounts.suspended = 0 ORDER BY posts.timestamp DESC LIMIT " + mysql.escape(limit) + ", " + mysql.escape(offset);
                    sqlAppConnection.query(sql, tokenResults[0].for_user_id, function(err, results) {
                      if (err) throw err;
                      res.status(200).json({
                        "error": null,
                        "contributions": results
                      })
                    })




                  });
                }  else {
                    res.status(400);
                    res.write(JSON.stringify({
                       "contributions": null,
                       "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
                } else {
                    res.status(400);
                    res.write(JSON.stringify({
                       "contributions": null,
                       "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                    }));
                    res.end();
                  }
              } else {
                res.status(400);
                  res.write(JSON.stringify({
                    "contributions": null,
                    "error": "AUTHORISATION_HEADER_NOT_PRESENT"
                  }));
                  res.end();
                }
              
            }
          )


          app.get('*', function(req, res) {
            res.status(404).json({"error": "ROUTE_NOT_FOUND", "results": null}).end();
          })
          // Bind to a port
          app.listen(1337);
          console.log('Application running!');
        
    };});}