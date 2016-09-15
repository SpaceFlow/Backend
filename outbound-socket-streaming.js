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
          	var authed = false;
          	socket.on("authentification" function(authData) {
          		if (authed == false) {
          			var sql = "SELECT for_user_id FROM oauth_tokens WHERE token = ?";
          			sqlAppConnection.query(sql, authData, function(err, tokenData) {
          				if (err) throw err;
          				if (tokenData[0] !== undefined) {

          				} else {
          					socket.close();
          				}
          			});
          		} else {
          				// socket-specific subscribed users list
          			  var subscribedUsers = [0];

          			  var socketMode = 0;
          			  // Socket Modi:
          			  // 0 - user sends a subscribe list
          			  // 1 - database call for followings, timeline streaming. automatic follow/unfollow sorting
          			  // 2 - Notification Stream (JSON based);
          			  // 3 - Notification Stream (Channel/JSON based)
          			  // 4 - 1 + 3

          			  socket.on("mode", function(data) {
          			  	data = parseInt(data);
          			  	if (data !== NaN) {
          			  		if (data < 5 && data > -1) {
          			  			socketMode = data;
          			  		}
          			  		if (socketMode == 1) {
          			  			// okay,  we have to checkout this shit
          			  			// query followings from this user
          			  			var sql = "SELECT follows FROM followings WHERE user = ?";
          			  			sqlAppConnection.query(sql, tokenData[0]["for_user_id"], function(err, data) {
          			  				if (err) throw err;
          			  				data.forEach(function(currentUser) {
          			  					subscribedUsers.push(parseInt(currentUser["follows"]));
          			  				});
          			  			});

          			  		}
          			  	}
          			  })


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


          			  newContributionEmitter.on("follow", function(followObject) {
          			  	if (socketMode >= 1) {
          			  		if (parseInt(followObject.target_user) == parseInt(tokenData[0]["for_user_id"])) {
          			  				if (socketMode == 1 || socketMode == 4) {
          			  					var index = subscribedUsers.indexOf(parseInt(followObject.target_user));
          			  					if (index > -1 && followObject.unfollow == true) {
          			  						subscribedUsers.splice(index, 1);
          			  					} else if (index == -1 && followObject.unfollow == false) {
          			  						subscribedUsers.push(parseInt(followObject.starter_user));
          			  					} 
          			  					if (socketMode == 2 || socketMode == 3 || socketMode == 4) {
          			  						// push notification
          			  						var sql = "SELECT username, screen_name, profile_image_url, bio FROM accounts WHERE id = ?";
          			  						sqlAppConnection.query(sql, followObject.starter_user, function(err, userResults) {
          			  							if (err) throw err;
          			  							userResults[0]["id"] = parseInt(followObject.starter_user);
          			  							socket.send("notification", {
          			  								"type": ((followObject.unfollow) ? "unfollow" : "follow"),
          			  								"target_user_id": followObject.target_user,
          			  								"starter_user": userResults[0],
          			  								"timestamp": Date.now()
          			  							});
          			  						})
          			  					}
          			  				}
          			  		}
          			  	}
          			  });




          			  newContributionEmitter.on('cont', function(contr) {
          			  	// handle new contributions
          			  	// check socket mode
          			  	if (socketMode == 0 || socketMode == 1 || socketMode == 3) {
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
          			  	}
          			  })
          		}
          	})
          });
          redisClient.monitor(function(err, res) {
              console.log("Started Monitoring");
          })
          redisClient.on("monitor", function(time, args, raw_reply) {

          	// contributions

              if (args[0] == "hmset" && args[1].indexOf("cont-") == 0) {
                  var contributionObject = {};
                  // parse array to assoc object
                  for (var i = 2; i < args.length; i = i + 2) {
                      contributionObject[args[i]] = args[i+1];
                  }
                  console.log("Triggering Contribuiton Emitter");
                  newContributionEmitter.emit('cont', contributionObject);
              }

              // follows

              
              if (args[0] == "hmset" && args[1].indexOf("follow-") == 0) {
                  var contributionObject = {};
                  // parse array to assoc object
                  for (var i = 2; i < args.length; i = i + 2) {
                      contributionObject[args[i]] = args[i+1];
                  }
                  console.log("Triggering Contribuiton Emitter");
                  newContributionEmitter.emit('follow', contributionObject);
              }
          })
      }
  });
}
