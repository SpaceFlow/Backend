
const cluster = require('cluster');
const http = require('http');
var fs = require("fs");

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
//var infrastructure = require("./ipmodule.js");
var config = JSON.parse(fs.readFileSync("config.json"));
//infrastructure.setTask("oauth-login");
//infrastructure.init();
var fs = require("fs");
setTimeout(function() {
		//var webserverAdress = infrastructure.getAdress("webserver");
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
				"oauth_login": fs.readFileSync("templates/oauth_login.html", "utf8")
			};
		}
		function randomCharacters(length)
		{
		    var text = "";
		    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

		    for( var i=0; i < length; i++ )
		        text += possible.charAt(Math.floor(Math.random() * possible.length));

		    return text;
		}
		reloadTemplates();
		authserv.get("/", function(req, res) {
			res.status(400).json({
				"error": "GET_REQUEST"  
			})
		})
		authserv.post("/", function(req, res) {
			console.log("Hit: " + req.query + " " + req.body);
			if (req.query !== undefined) {
					//check params
					if (req.query.app_id 	!== undefined) {
					if (req.query.app_id.length == 64) {
					if (req.query.scopes 		!== undefined) {
					if (req.query.redirect_uri 	!== undefined) {
					if (req.query.response_type !== undefined) {

						sqlConnection.query("SELECT app_id, app_secret, app_name, redirect_uri FROM oauth_applications WHERE app_id=" + mysql.escape(req.query.app_id) + ";", function(err, results) {
							if (err) throw err;
							if (results[0] !== undefined) {
								//App found
								if (req.body.password !== undefined && req.body.username !== undefined) {
									// User and Password sent? If yes, check them, if not send the login form
									sqlConnection.query("SELECT id, username, password, salt FROM accounts WHERE username=" + mysql.escape(req.body.username), function (err, accountResults) {
										if (accountResults[0] !== undefined ) {
											//Account Found
											if (sha256(accountResults[0]["salt"] + req.body.password) == accountResults[0]["password"]) {
												// LUL THIS USER ACTUALLY KNOWS HOW TO TYPE HIS PASSWORD PogChamp
												// Let's generate him a fuckin' token and we're ready!

												if (req.query.response_type == "code") {
													// Auth Code Flow
													// Generate a key and GET it to the redirect_uri
													// Has to do an additional request to get the token

													//Generate Codes
													var token = randomCharacters(64);
													var code = randomCharacters(64);

													//Prepare for SQL
													var insertValues = {
														"app_id": results[0]["app_id"],
														"token": token,
														"for_user_id": accountResults[0]["id"],
														"scopes": req.query.scopes,
														"token_code": code
													}

													// Generate and query SQL
													sqlConnection.query("INSERT INTO oauth_tokens SET ?", insertValues, function(err, insertResults) {
														if (err) throw err;
														res.status(302);
														res.location(results[0]["redirect_uri"] + "?code=" + code);
														res.end();
													});

												} else if (req.query.response_type == "token") {
													// Implicit Grant Flow
													// Generate & Transmit an actual token in a html parameter

													// Generate Token
													var token = randomCharacters(64);

													// Prepare SQL Innsert
													var insertValues = {
														"app_id": results[0]["app_id"],
														"token": token,
														"for_user_id": accountResults[0]["id"],
														"scopes": req.query.scopes
													}

													// query dis shet
													sqlConnection.query("INSERT INTO oauth_tokens SET ?", insertValues, function(err, insertResults) {
														if (err) throw err;

														//Send HTTP response
														res.status(302);
														res.location(results[0]["redirect_uri"] + "#token=" + token);
														res.end();
													});

												} else {
													res.status(501).json({
														"error": "INVALID_AUTH_METHOD"
													})
												}
											} else {
												//could someone please explain $user how keyboards work an they have to hit the right key when they're typing in their passwords?
												res.status(401).json({
													"error": "INVALID_CREDENTIALS"
												})
												res.end();
											}
										} else {
											res.status(401).json({
													"error": "INVALID_CREDENTIALS"
												})
												res.end();
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

								
							} else {
								// invalid appid
								res.status(400).json({
									"error": "INVALID_APP_ID"
								})
								res.end();
							}
							
						})
					} else {
						//missing param: response type
						res.status(400).json({
							"error": "MISSING_RESPONSE_TYPE"
						})
						res.end();
					}
					} else {
						// missing param: redirect_uri
						res.status(400).json({
							"error": "MISSING_REDIRECT_URI"
						})
						res.end();
					}
					} else {
						res.status(400).json({
							"error": "MISSING_SCOPES"
						})
						res.end();
					}
					} else {
						res.status(401).json({
							"error": "INVALID_CLIENT_ID"
						})
						res.end();

					}
					} else {
						res.status(400).json({
							"error": "MISSING_CLIENT_ID"
						})
						res.end();
					}
			}
		});
		authserv.post("/token", function(req, res) {
			if (req.query !== undefined) {

					//check parameters
					if (req.query.app_id 		!== undefined) {
					if (req.query.app_id.length	== 64) {
					if (req.query.app_secret 		!== undefined) {
					if (req.query.app_secret.length	== 64) {
					if (req.query.redirect_uri 	!== undefined) {
					if (req.query.code 			!== undefined) {
					if (req.query.code.length	== 64) {
						sqlConnection.query("SELECT app_id, app_secret, app_name, redirect_uri FROM oauth_applications WHERE app_id=" + mysql.escape(req.query.app_id) + " AND app_secret=" + mysql.escape(req.query.app_secret) + " AND redirect_uri=" + mysql.escape(req.query.redirect_uri) + ";", function(err, results) {
							if (err) throw err;
							if (results[0] !== undefined) {
								//App found
								var query = sqlConnection.query("SELECT scopes, token FROM oauth_tokens WHERE token_code=" + mysql.escape(req.query.code), function(err, results) {
									if (err) throw err;
									if (results[0] !== undefined) {
										res.status(200);
										res.send(JSON.stringify({
											"scopes": results[0]["scopes"],
											"token": results[0]["token"]
										}))
										res.end();
									} else {
										// Code invalid
										res.status(401).json({
											"error": "INVALID_CODE"
										})
										res.end();
									}
								});
								console.log(query.sql);

							} else {
								// invalid appid
								console.log("No SQL results");
								res.status(401).json({
									"error": "INVALID_APP_ID"
								})
								res.end();
							}
						});
					} else {
						res.status(401).json({
							"error": "INVALID_CODE"
						})
						res.end();
					}
					} else {
						// missing param: code
						res.status(400).json({
							"error": "MISSING_CODE"
						})
						res.end();
					}
					} else {
						// missing param: redirect_uri
						res.status(400).json({
							"error": "MISSING_REDIRECT_URI"
						})
						res.end();
					}
					} else {
						//malformed request (invalid secret length)
						res.status(401).json({
							"error": "INVALID_SECRET"
						})
						res.end();
					}
					} else {
						// missing param: secret
						res.status(400).json({
							"error": "MISSING_SECRET"
						})
						res.end();
					}
					} else {
						// malformed request: app_id_length
						res.status(401).json({
							"error": "INVALID_APP_ID"
						})
						res.end();
					}
					} else {
						// missing param: app_id
						res.status(400).json({
							"error": "MISSING_APP_ID"
						})
						res.end();
					}
			}
		});
		app.use("/oauth2", authserv);


}, 1000);
}
