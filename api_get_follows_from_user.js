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
          app.get("/user/self/followers", function(req, res) {
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
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE user IN (SELECT user FROM followings WHERE follows = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst" ) AND suspended = 0";
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
          app.get("/user/:user/followers", function(req, res) {
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
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE user IN (SELECT user FROM followings WHERE follows = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst" ) AND suspended = 0";
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
          app.get("/user/self/followings", function(req, res) {
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
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE follows IN (SELECT follows FROM followings WHERE user = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst" ) AND suspended = 0";
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
          app.get("/user/:user/followings", function(req, res) {
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
                        var sql = "SELECT id, username, screen_name, profile_image_url, bio FROM accounts WHERE following IN (SELECT follows FROM followings WHERE user = ? LIMIT " + mysql.escape(req.query.limit) + "," + mysql.escape(req.query.offset) + " ORDER BY id " + newestFirst" ) AND suspended = 0";
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
          app.listen(3003);
      };
      })
    }