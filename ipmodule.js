// Client Module to connect to the Round Robin Server
// Author: Kirschn
var loadserveradress = "http://localhost:8081";
// CODE:
var ioclient = require("socket.io-client")(loadserveradress),
    request = require("request"),
    util = require("util"),
    express = require("request"),
    poolcache = {};
var http = require('http');
var express = require('express');
Array.prototype.unset = function(value) {
    if(this.indexOf(value) != -1) { // Make sure the value exists
        this.splice(this.indexOf(value), 1);
    }   
};
var mytask = null,
    myid = NaN;
var pools = {};

module.exports = {
	pools: function() {
		// Gibt Array mit allen aktiven IPs zurück
		// Client kann daraus nen runden Robin bauen
		return pools;
	},
	setTask: function(taskname) {
		// Muss vor Initierung aufgerufen werden
		// Setzt Rolle des Client
		if (taskname !== undefined) {
			return (mytask = taskname);
		}
	},
	init: function() {
		if (mytask == null) {
			util.log("Note: Registering with undefined task")
		}
		var app = express();
		var server = http.createServer(app).listen();
		app.set('port', server.address().port);
		util.log("Trying to register...");
		util.log("Client Config: Port " + app.get('port'));
		ioclient.emit("register", JSON.stringify({
		    port: app.get('port'),
		    job: mytask
		}));
		var pinging = true;
		setInterval(function() {
		    
		    if (pinging) {
		    ioclient.send(JSON.stringify({
		        load: null,
		        type: "ping"
		    }));
		        
		    }
		}, 1000);
		util.log("Connected!");
		ioclient.on("message", function(data) {
		    var parseddata = JSON.parse(data);
		    console.log(parseddata);
		    if (parseddata.type == "fuckyou") {
		        // Ping abgewiesen, Skript wahrscheinlich korrupt!
		        console.log(parseddata);
		        util.log("FeelsBadMan");
		        process.exit(1);
		    }
		})
		ioclient.on("task", function(data) {
		    var parsedtask = JSON.parse(data)
		    mytask = parsedtask.job;
		    myid = parsedtask.id;
		    util.log("I AM " + myid + ". MY TASK IS " + mytask);
		    module.exports.getPools(function() {
		        // Fertig initialisiert!
		        util.log("Done!");
		        ioclient.on("poolupdate", function(data) {
		            pools = JSON.parse(data);
		            util.log("Parsed new Pool JSON");
		        })
		        
		        
		        
		        
		    })
		});
		app.get('/', function(req, res) { 
		    res.end(JSON.stringify(pools))
		    
		});
		process.stdin.setEncoding('utf8');
		process.stdin.on('readable', function() {
		    var chunk = process.stdin.read();
		if (chunk !== null) {
		    eval(chunk)
		}
		});
	},
	getPools: function getPools(callback) {
    request(loadserveradress, function (error, response, body) {
  		if (!error && response.statusCode == 200) {
    	console.log("Pool request successfull: " + body);
    	pools = JSON.parse(body);
    	callback();
    }
})
}
}