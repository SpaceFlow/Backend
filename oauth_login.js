
const cluster = require('cluster');
const http = require('http');

if (cluster.isMaster) {
  const numCPUs = require('os').cpus().length;
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
    console.log("Master: Forking workers...");
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log('worker %d died (%s). restarting...',
      worker.process.pid, signal || code);
    cluster.fork();
  });

} else {
var infrastructure = require("./ipmodule.js");
var config = JSON.parse(fs.readFileSync("config.json"));
infrastructure.setTask("oauth-login");
infrastructure.init();
var fs = require("fs");
setTimeout(function() {
		var webserverAdress = infrastructure.getAdress("webserver");
		var express = require("express");
		var app = express();
		var mysql = require("mysql");
		var bodyParser = require("body-parser");
		var server = http.createServer(app).listen(3002);
		var sqlConnection = mysql.createConnection(config.sqlConfig);
		var authserv = express();
		var sha256 = require("js-sha256");
		authserv.use(bodyParser.json()); // for parsing application/json
		authserv.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
		authserv.on('mount', function() {
			console.log("Authentication Server mounted");
		})
		var templates = {}
		var reloadTemplates = function() {
			templates = {
				"oauth_login": fs.readFileSync("templates/oauth_login.html", "utf8");
			}
		}
		function createSalt()
		{
		    var text = "";
		    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/*-.,";

		    for( var i=0; i < 5; i++ )
		        text += possible.charAt(Math.floor(Math.random() * possible.length));

		    return text;
		}
		reloadTemplates();
		authserv.get("/", function(req, res) {
			if (req.query !== undefined) {
					if (req.query.app_id 	!== undefined) {
					if (req.query.app_id.length == 64) {
					if (req.query.scopes 		!== undefined) {
					if (req.query.redirect_uri 	!== undefined) {
					if (req.query.response_type !== undefined) {
						//check params
						sqlConnection.query("SELECT app_id, app_secret, app_name FROM oauth_applications WHERE app_id=" + mysql.escape(res.query.app_id) + ";", function(err, results) {
							if (err) throw err;
							if (results[0] !== undefined) {
								if (req.body.password !== undefined && req.body.username !== undefined) {
									sqlConnection.query("SELECT id, username, password, salt FROM accounts WHERE username=" + mysql.escape(req.body.username), function (err, accountResults) {
										if (accountResults[0] !== undefined ) {
											if (sha256(accountResults[0]["salt"] + req.body.password) == accountResults[0]["password"]) {
												// LUL THIS USER ACTUALLY KNOWS HOW TO TYPE HIS PASSWORD PogChamp
												// Let's generate him a fuckin' token and we're ready!
												// TODO: Generate token
											} else {
												//could someone please explain $user how keyboards work an they have to hit the right key when they're typing in their passwords?
											}
										} else {
											//Wrong Username
										}
									});
								} else {
									res.send(templates["oauth_login"]
										.replace("[[[scopes]]]", req.query.scopes.replace("<", ""))
										.replace("[[[app_name]]]", results[0]["app_name"].replace("<", ""))
										.replace("[[[app_id]]]", results[0]["app_id"])
										);
									res.end();
								}

								
								if (req.query.response_type == "code") {
									// Auth Code Flow

								} else if (req.query.response_type == "token") {
									// Grand flow

								} else {
									// Unsupported method
								}
							} else {
								// invalid appid
							}
							
						})
					} else {
						//missing param: response type
					}
					} else {
						// missing param: redirect_uri
					}
					} else {
						// missing param: scopes
					}
					} else {
						//malformed request (invalid client-id)

					}
					} else {
						// missing param: client_id
					}
			}
		});


}, 1000);
}